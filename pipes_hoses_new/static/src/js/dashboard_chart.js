/** @odoo-module **/

import { Component, onMounted, onWillUnmount, useRef, onWillUpdateProps } from "@odoo/owl";
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
        this.chart = null;
        this.notification = useService("notification");

        onMounted(() => {
            this.renderChart();
        });

        onWillUpdateProps(() => {
            if (this.chart) {
                this.chart.destroy();
            }
        });

        onWillUnmount(() => {
            if (this.chart) {
                this.chart.destroy();
            }
        });
    }

    get chartData() {
        try {
            const value = this.props.record.data[this.props.name];
            if (!value) return null;
            return JSON.parse(value);
        } catch (error) {
            console.error('Error parsing chart data:', error);
            return null;
        }
    }

    renderChart() {
    const canvas = this.chartRef.el;
    if (!canvas) return;

    const data = this.chartData;
    if (!data || !data.actual || data.actual.length === 0) {
        return;
    }

    const ctx = canvas.getContext('2d');

    // Get frequency value (still needed for display purposes)
    const record = this.props.record.data;
    const frequencyValue = parseFloat(record.frequency_value);
    if (!frequencyValue || frequencyValue <= 0) {
        console.warn("Invalid frequency value detected:", frequencyValue);
        return;
    }

    // Prepare planned data - use the time field directly from the data
    const plannedData = data.planned.map((d) => ({
        x: d.time,  // Use the time field directly from backend
        y: d.value,
        degree: d.degree,
        dimension: d.value,
        cycle: d.cycle
    }));

    // Prepare actual data using time field from logs
    const actualData = data.actual.map((d) => ({
        x: d.time,
        y: d.value,
        degree: d.degree,
        dimension: d.value,
        cycle: d.cycle || 1
    }));

    const datasets = [
        {
            label: 'Planned',
            data: plannedData,
            borderColor: 'rgba(75, 192, 192, 1)', // Light blue
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5], // Dotted line
            tension: 0.4,
            pointRadius: 2,
            pointHoverRadius: 5,
        },
        {
            label: 'Actual',
            data: actualData,
            borderColor: 'rgb(0, 0, 0)', // Black
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.4,
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
                duration: 300
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
                    }
                },
                tooltip: {
                    mode: 'nearest',
                    intersect: false,
                    callbacks: {
                        title: function(context) {
                            const point = context[0].raw;
                            return `${point.degree}° - ${point.x.toFixed(4)}s - Cycle ${point.cycle || 1}`;
                        },
                        label: function(context) {
                            const point = context.raw;
                            return `${context.dataset.label}: ${point.dimension.toFixed(2)} MM`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
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
                            return value.toFixed(2) + 's';
                        }
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

    // Show lines by enabling showLine for each dataset
    this.chart.data.datasets.forEach(dataset => {
        dataset.showLine = true;
    });
    this.chart.update();
}

    async exportChart() {
        if (!this.chart) return;

        try {
            const canvas = this.chartRef.el;
            const dataURL = canvas.toDataURL('image/png');

            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.download = `cycle_chart_${timestamp}.png`;
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
            let csv = 'Type,Degree,Value (MM)\n';

            data.actual.forEach(point => {
                csv += `Actual,${point.degree},${point.value}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.download = `cycle_data_${timestamp}.csv`;
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