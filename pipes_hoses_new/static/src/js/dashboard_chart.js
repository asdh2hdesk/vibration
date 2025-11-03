/** @odoo-module **/

import { Component, onMounted, onWillUnmount, useRef, useState, onWillUpdateProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

export class VibrationLiveChartField extends Component {
    static template = "vibration_monitoring.VibrationLiveChartField";
    static props = {
        ...standardFieldProps,
    };

    setup() {
        this.chartRef = useRef("liveChartCanvas");
        this.chartContainerRef = useRef("chartContainer");
        this.chart = null;
        this.notification = useService("notification");
        this.refreshInterval = null;
        this.lastDataLength = 0;

        // Queue for single-point animation
        this.pointQueue = [];
        this.isProcessingQueue = false;
        this.pointInterval = null;

        // Add state for controlling live updates and fullscreen
        this.state = useState({
            isRunning: false,
            isFullscreen: false
        });

        onMounted(() => {
            this.renderChart();
            this.syncWithDashboard();
            this.setupFullscreenListener();
        });

        onWillUpdateProps((nextProps) => {
            this.syncWithDashboard(nextProps);
        });

        onWillUnmount(() => {
            this.stopAutoUpdate();
            this.stopPointAnimation();
            this.removeFullscreenListener();
            if (this.chart) {
                this.chart.destroy();
            }
        });
    }

    setupFullscreenListener() {
        this.fullscreenChangeHandler = () => {
            this.state.isFullscreen = !!document.fullscreenElement;
            // Resize chart when entering/exiting fullscreen
            if (this.chart) {
                setTimeout(() => this.chart.resize(), 100);
            }
        };
        document.addEventListener('fullscreenchange', this.fullscreenChangeHandler);
    }

    removeFullscreenListener() {
        if (this.fullscreenChangeHandler) {
            document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);
        }
    }

    async toggleFullscreen() {
        const container = this.chartContainerRef.el;
        if (!container) return;

        try {
            if (!document.fullscreenElement) {
                // Enter fullscreen
                await container.requestFullscreen();
            } else {
                // Exit fullscreen
                await document.exitFullscreen();
            }
        } catch (error) {
            console.error('Fullscreen error:', error);
            this.notification.add('Failed to toggle fullscreen', {
                type: 'warning',
            });
        }
    }

    get selectedFrequency() {
        const freq = this.props.record.data.selected_frequency;
        if (!freq) return '';
        return freq.toUpperCase();
    }

    syncWithDashboard(props = this.props) {
        const isLiveRunning = props.record.data.is_live_running;

        if (isLiveRunning && !this.state.isRunning) {
            console.log('Dashboard started - starting chart');
            setTimeout(() => this.startAutoUpdate(), 100);
        } else if (!isLiveRunning && this.state.isRunning) {
            console.log('Dashboard stopped - stopping chart');
            this.stopAutoUpdate();
        }
    }

    startAutoUpdate() {
        if (this.refreshInterval) return;

        this.state.isRunning = true;

        this.refreshInterval = setInterval(() => {
            const data = this.chartData;
            if (!data || !data.actual || data.actual.length === 0) return;

            const newPointCount = data.actual.length - this.lastDataLength;
            if (newPointCount > 0) {
                const newPoints = data.actual.slice(-newPointCount);
                this.queuePoints(newPoints);
                this.lastDataLength = data.actual.length;
            }
        }, 125);

        this.startPointAnimation();
    }

    queuePoints(newPoints) {
        this.pointQueue.push(...newPoints);
    }

    startPointAnimation() {
        if (this.pointInterval) return;

        this.pointInterval = setInterval(() => {
            if (this.pointQueue.length > 0) {
                const point = this.pointQueue.shift();
                this.addSinglePoint(point);
            }
        }, 125);
    }

    stopPointAnimation() {
        if (this.pointInterval) {
            clearInterval(this.pointInterval);
            this.pointInterval = null;
        }
        this.pointQueue = [];
    }

    addSinglePoint(point) {
        if (!this.chart) return;

        const actualDataset = this.chart.data.datasets[1];
        const plannedDataset = this.chart.data.datasets[0];

        actualDataset.data.push({
            x: point.time,
            y: point.value,
            degree: point.degree,
            dimension: point.value,
            cycle: point.cycle || 1,
            sub_cycle: point.sub_cycle || 1
        });

        if (this.plannedDataFull && this.plannedDataFull.length > 0) {
            const plannedPoint = this.plannedDataFull.find(p =>
                p.degree === point.degree &&
                p.cycle === point.cycle &&
                p.sub_cycle === point.sub_cycle
            );

            if (plannedPoint) {
                plannedDataset.data.push({
                    x: point.time,
                    y: plannedPoint.y,
                    degree: plannedPoint.degree,
                    dimension: plannedPoint.dimension,
                    cycle: plannedPoint.cycle,
                    sub_cycle: plannedPoint.sub_cycle
                });
            }
        }

        const latestTime = point.time;
        const windowStart = Math.max(0, latestTime - 5);

        const removeThreshold = windowStart - 1;
        actualDataset.data = actualDataset.data.filter(d => d.x > removeThreshold);
        plannedDataset.data = plannedDataset.data.filter(d => d.x > removeThreshold);

        this.chart.options.scales.x.min = windowStart;
        this.chart.options.scales.x.max = latestTime + 0.5;

        this.chart.update('none');
    }

    stopAutoUpdate() {
        this.state.isRunning = false;

        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        this.stopPointAnimation();
    }

    toggleLiveUpdate() {
        if (this.state.isRunning) {
            this.stopAutoUpdate();
        } else {
            this.startAutoUpdate();
        }
    }

    get chartData() {
        try {
            const value = this.props.record.data[this.props.name];
            if (!value) {
                console.warn('No chart data value found');
                return null;
            }
            const parsed = JSON.parse(value);

            if (parsed) {
                console.log('Chart data structure:', {
                    hasPlanned: !!parsed.planned,
                    plannedLength: parsed.planned?.length || 0,
                    hasActual: !!parsed.actual,
                    actualLength: parsed.actual?.length || 0
                });
            }

            return parsed;
        } catch (error) {
            console.error('Error parsing chart data:', error);
            return null;
        }
    }

    updateChart() {
        if (!this.chart) {
            this.renderChart();
            return;
        }

        const data = this.chartData;
        if (!data || !data.actual || data.actual.length === 0) {
            return;
        }

        const latestTime = Math.max(...data.actual.map(d => d.time));
        const windowStart = Math.max(0, latestTime - 5);
        const windowEnd = latestTime + 0.5;

        this.chart.options.scales.x.min = windowStart;
        this.chart.options.scales.x.max = windowEnd;

        const plannedData = data.planned.map((d) => ({
            x: d.time,
            y: d.value,
            degree: d.degree,
            dimension: d.value,
            cycle: d.cycle,
            sub_cycle: d.sub_cycle
        }));

        const actualData = data.actual.map((d) => ({
            x: d.time,
            y: d.value,
            degree: d.degree,
            dimension: d.value,
            cycle: d.cycle || 1,
            sub_cycle: d.sub_cycle || 1
        }));

        this.chart.data.datasets[0].data = plannedData;
        this.chart.data.datasets[1].data = actualData;

        this.chart.update('none');
    }

    renderChart() {
        const canvas = this.chartRef.el;
        if (!canvas) return;

        const data = this.chartData;
        if (!data) {
            this.initializeEmptyChart(canvas);
            return;
        }

        const ctx = canvas.getContext('2d');
        ctx.canvas.style.backgroundColor = 'white';

        const latestTime = data.actual && data.actual.length > 0
            ? Math.max(...data.actual.map(d => d.time))
            : 5;
        const windowStart = Math.max(0, latestTime - 5);
        const windowEnd = latestTime + 0.5;

        this.plannedDataFull = [];
        if (data.planned && Array.isArray(data.planned) && data.planned.length > 0) {
            this.plannedDataFull = data.planned.map((d) => ({
                x: d.time,
                y: d.value,
                degree: d.degree,
                dimension: d.value,
                cycle: d.cycle,
                sub_cycle: d.sub_cycle
            }));
            console.log('Planned data stored:', this.plannedDataFull.length, 'points');
        }

        const plannedData = [];
        const actualData = [];

        const datasets = [
            {
                label: 'Planned',
                data: plannedData,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                borderWidth: 2,
                borderDash: [5, 5],
                tension: 0.4,
                pointRadius: 1,
                pointHoverRadius: 4,
                showLine: true,
            },
            {
                label: 'Actual',
                data: actualData,
                borderColor: 'rgb(0, 0, 0)',
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                borderWidth: 2,
                pointRadius: 1,
                tension: 0.4,
                showLine: true,
            }
        ];

        this.chart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0,
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'Dimension vs Time',
                        font: {
                            size: 16,
                            weight: 'bold'
                        },
                    },
                    tooltip: {
                        mode: 'nearest',
                        intersect: false,
                        callbacks: {
                            title: function(context) {
                                const point = context[0].raw;
                                return `${point.degree}° - ${point.x.toFixed(3)}s - Record ${point.cycle}, Cycle ${point.sub_cycle}`;
                            },
                            label: function(context) {
                                const point = context.raw;
                                return `${context.dataset.label}: ${point.dimension.toFixed(2)} MM`;
                            }
                        }
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x',
                            modifierKey: null,
                        },
                        limits: {
                            x: {
                                min: 0,
                                max: latestTime + 10,
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: windowStart,
                        max: windowEnd,
                        title: {
                            display: true,
                            text: 'Time (seconds)',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(1) + 's';
                            },
                            maxTicksLimit: 10
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Dimension (MM)',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            display: true,
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
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });

        this.lastDataLength = 0;
    }

    initializeEmptyChart(canvas) {
        const ctx = canvas.getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'scatter',
            data: { datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Waiting for data...',
                        font: { size: 16 }
                    }
                }
            }
        });
    }

    async exportChart() {
        if (!this.chart) return;

        try {
            const canvas = this.chartRef.el;
            const dataURL = canvas.toDataURL('image/png');

            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.download = `live_chart_${timestamp}.png`;
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
        const chartData = this.props.record.data[this.props.name];

        if (!chartData) {
            this.notification.add('No data to export', {
                type: 'warning',
            });
            return;
        }

        try {
            const data = JSON.parse(chartData);
            let csv = 'Type,Record,Cycle,Degree,Time,Value (MM)\n';

            data.actual.forEach(point => {
                csv += `Actual,${point.cycle || 1},${point.sub_cycle || 1},${point.degree},${point.time.toFixed(4)},${point.value.toFixed(2)}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.download = `live_data_${timestamp}.csv`;
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
}

registry.category("fields").add("vibration_live_chart", {
    component: VibrationLiveChartField,
});