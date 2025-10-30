/** @odoo-module **/

import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

export class VibrationChartField extends Component {
    static template = "vibration_monitoring.VibrationChartField";
    static props = {
        ...standardFieldProps,
    };

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.chartRef = useRef("chartCanvas");
        this.state = useState({
            isRunning: false,
            dataPoints: [],
            maxPoints: 96,
            currentCycle: 0,
            currentDegree: 0,
            showCycleInfo: true
        });

        this.chart = null;
        this.updateInterval = null;

        onMounted(() => {
            this.initChart();
            this.loadInitialData();
        });

        onWillUnmount(() => {
            this.stopLiveUpdate();
            if (this.chart) {
                this.chart.destroy();
            }
        });
    }

    get recordId() {
        return this.props.record.resId;
    }

    initChart() {
        const canvas = this.chartRef.el;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(54, 162, 235, 0.5)');
        gradient.addColorStop(1, 'rgba(54, 162, 235, 0.0)');

        this.chart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Dimension vs Time',
                    data: [],
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    showLine: true,
                    fill: false,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Time (seconds)',
                            font: { size: 14, weight: 'bold' }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(2) + 's';
                            }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Dimension (MM)',
                            font: { size: 14, weight: 'bold' }
                        },
                        grid: {
                            color: function(context) {
                                if (context.tick.value === 0) {
                                    return 'rgba(0, 0, 0, 0.5)';
                                }
                                return 'rgba(0, 0, 0, 0.1)';
                            },
                            lineWidth: function(context) {
                                if (context.tick.value === 0) {
                                    return 2;
                                }
                                return 1;
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'nearest',
                        intersect: false,
                        callbacks: {
                            title: function(context) {
                                const point = context[0].raw;
                                if (point.cycle !== undefined && point.degree !== undefined) {
                                    return `Cycle ${point.cycle} - ${point.degree}°`;
                                }
                                return '';
                            },
                            label: function(context) {
                                const point = context.raw;
                                let label = `Time: ${point.x.toFixed(4)}s\n`;
                                label += `Dimension: ${point.dimension.toFixed(2)} MM`;
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    async loadInitialData() {
        if (!this.recordId) return;

        try {
            const data = await this.orm.call(
                'vibration.monitor',
                'get_live_data',
                [this.recordId]
            );

            if (data && data.length > 0) {
                this.state.dataPoints = data;
                if (data.length > 0) {
                    const lastPoint = data[data.length - 1];
                    this.state.currentCycle = lastPoint.cycle || 0;
                    this.state.currentDegree = lastPoint.degree || 0;
                }
                this.updateChart();
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    updateChart() {
        if (!this.chart) return;

        // Use time_actual directly from the data points
        const chartData = this.state.dataPoints.map((point) => {
            const cycleNumber = point.cycle - 1; // 0-based cycle index
            const degreeIndex = [0, 45, 90, 135, 180, 225, 270, 315, 360].indexOf(point.degree);
            const timeInCycle = degreeIndex / 8.0; // 360° should be at position 8/8 = 1.0

            const totalTime = cycleNumber + timeInCycle;
            return {
                x: point.time_actual || 0,
                y: point.dimension,
                cycle: point.cycle,
                degree: point.degree,
                dimension: point.dimension,
                time_in_cycle: point.time_in_cycle
            };
        });

        this.chart.data.datasets[0].data = chartData;
        this.chart.update('none');
    }

    async toggleLiveUpdate() {
        if (this.state.isRunning) {
            this.stopLiveUpdate();
        } else {
            this.startLiveUpdate();
        }
    }

    startLiveUpdate() {
        if (!this.recordId) return;

        this.state.isRunning = true;
        this.updateInterval = setInterval(async () => {
            await this.fetchLatestData();
        }, 125);
    }

    stopLiveUpdate() {
        this.state.isRunning = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    async fetchLatestData() {
        if (!this.recordId) return;

        try {
            const newPoint = await this.orm.call(
                'vibration.monitor',
                'get_latest_reading',
                [this.recordId]
            );

            if (newPoint) {
                const sampleDegrees = [0, 45, 90, 135, 180, 225, 270, 315, 360];
                const degreeIndex = sampleDegrees.indexOf(newPoint.degree);

                if (degreeIndex !== -1) {
                    const totalPoints = this.state.dataPoints.length;
                    const cycleNumber = Math.floor(totalPoints / 9) + 1;

                    // Get frequency from record to calculate cycle duration
                    const record = this.props.record.data;
                    const frequencyValue = record.frequency_value || 2;
                    const cycleDuration = 1.0 / frequencyValue;

                    const timeInCycle = (degreeIndex / 8.0) * cycleDuration;
                    const timeActual = (cycleNumber - 1) * cycleDuration + timeInCycle;

                    const enrichedPoint = {
                        ...newPoint,
                        cycle: cycleNumber,
                        time_in_cycle: timeInCycle,
                        time_actual: timeActual
                    };

                    this.state.dataPoints.push(enrichedPoint);
                    this.state.currentCycle = cycleNumber;
                    this.state.currentDegree = newPoint.degree;

                    if (this.state.dataPoints.length > this.state.maxPoints) {
                        this.state.dataPoints.shift();
                    }

                    this.updateChart();
                }
            }
        } catch (error) {
            console.error('Error fetching latest data:', error);
        }
    }

    async exportChart() {
        if (!this.chart) return;

        try {
            const canvas = this.chartRef.el;
            const dataURL = canvas.toDataURL('image/png');

            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.download = `vibration_chart_${timestamp}.png`;
            link.href = dataURL;
            link.click();

            this.notification.add('Chart exported successfully', {
                type: 'success',
            });
        } catch (error) {
            this.notification.add('Error exporting chart', {
                type: 'danger',
            });
            console.error('Export error:', error);
        }
    }

    async exportData() {
        if (this.state.dataPoints.length === 0) {
            this.notification.add('No data to export', {
                type: 'warning',
            });
            return;
        }

        try {
            let csv = 'Cycle,Degree,Time in Cycle (s),Time Actual (s),Dimension (MM),Amplitude,Timestamp\n';
            this.state.dataPoints.forEach(point => {
                csv += `${point.cycle || ''},${point.degree || ''},${point.time_in_cycle || ''},${point.time_actual || ''},${point.dimension},${point.amplitude},${point.timestamp}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.download = `vibration_data_${timestamp}.csv`;
            link.href = url;
            link.click();
            window.URL.revokeObjectURL(url);

            this.notification.add('Data exported successfully', {
                type: 'success',
            });
        } catch (error) {
            this.notification.add('Error exporting data', {
                type: 'danger',
            });
            console.error('Export error:', error);
        }
    }

    clearData() {
        this.state.dataPoints = [];
        this.state.currentCycle = 0;
        this.state.currentDegree = 0;
        this.updateChart();
        this.notification.add('Chart data cleared', {
            type: 'info',
        });
    }

    toggleCycleInfo() {
        this.state.showCycleInfo = !this.state.showCycleInfo;
    }
}

registry.category("fields").add("vibration_chart", {
    component: VibrationChartField,
});