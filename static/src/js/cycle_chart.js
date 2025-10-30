/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, onMounted, useRef, onWillUnmount } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

// Small inline chart for tree view
class CycleChartWidget extends Component {
    setup() {
        this.notification = useService("notification");
        this.chartRef = useRef("chart");
        this.chart = null;

        onMounted(() => {
            this.renderChart();
        });

        onWillUnmount(() => {
            if (this.chart) {
                this.chart.destroy();
            }
        });
    }

    renderChart() {
        const chartData = this.props.record.data[this.props.name];

        if (!chartData || !this.chartRef.el) {
            return;
        }

        try {
            const data = JSON.parse(chartData);
            const ctx = this.chartRef.el.getContext('2d');

            // Destroy existing chart
            if (this.chart) {
                this.chart.destroy();
            }

            // Prepare data points for scatter plot
            const plannedData = data.planned.map((d, index) => ({
                x: index,
                y: d.value,
                degree: d.degree
            }));

            const actualData = data.actual.map((d, index) => ({
                x: index,
                y: d.value,
                degree: d.degree
            }));

            // Create new chart with Chart.js
            this.chart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [
                        {
                            label: 'Dimension (MM)',
                            data: actualData,
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgba(75, 192, 192, 0.5)',
                            borderWidth: 2,
                            pointRadius: 2,
                            showLine: true,
                            tension: 0.4,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            enabled: false
                        }
                    },
                    scales: {
                        x: {
                            display: false,
                            type: 'linear'
                        },
                        y: {
                            display: false
                        }
                    },
                    animation: false
                }
            });
        } catch (e) {
            console.error('Error rendering chart:', e);
        }
    }
}

CycleChartWidget.template = "vibration_monitor.CycleChartWidget";

// Detailed chart for form view
class CycleChartDetailWidget extends Component {
    setup() {
        this.notification = useService("notification");
        this.chartRef = useRef("chart");
        this.chart = null;

        onMounted(() => {
            this.renderChart();
        });

        onWillUnmount(() => {
            if (this.chart) {
                this.chart.destroy();
            }
        });
    }

    renderChart() {
        const chartData = this.props.record.data[this.props.name];

        if (!chartData || !this.chartRef.el) {
            return;
        }

        try {
            const data = JSON.parse(chartData);
            const ctx = this.chartRef.el.getContext('2d');

            // Destroy existing chart
            if (this.chart) {
                this.chart.destroy();
            }

            // Calculate time based on degree positions (assuming 9 points per cycle: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°, 360°)
            // Get frequency from record if available
            const record = this.props.record.data;
            const frequencyValue = record.frequency_value || 2; // Default 2Hz
            const cycleDuration = 1.0 / frequencyValue;

            // Prepare data points for scatter plot with time in seconds
            const plannedData = data.planned.map((d, index) => {
                const degreeIndex = [0, 45, 90, 135, 180, 225, 270, 315, 360].indexOf(d.degree);
                const timeInCycle = (degreeIndex / 8.0) * cycleDuration;
                return {
                    x: timeInCycle,
                    y: d.value,
                    degree: d.degree,
                    dimension: d.value
                };
            });

            const actualData = data.actual.map((d, index) => {
                const degreeIndex = [0, 45, 90, 135, 180, 225, 270, 315, 360].indexOf(d.degree);
                const timeInCycle = (degreeIndex / 8.0) * cycleDuration;
                return {
                    x: timeInCycle,
                    y: d.value,
                    degree: d.degree,
                    dimension: d.value
                };
            });

            // Create detailed chart
            this.chart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [
                        {
                            label: 'Dimension (MM)',
                            data: actualData,
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgba(75, 192, 192, 0.5)',
                            borderWidth: 3,
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            showLine: true,
                            tension: 0.4,
                            fill: false,
                        }
                    ]
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
                        tooltip: {
                            mode: 'nearest',
                            intersect: false,
                            callbacks: {
                                title: function(context) {
                                    const point = context[0].raw;
                                    return `${point.degree}° - ${point.x.toFixed(4)}s`;
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
                            min: 0,
                            max: cycleDuration,
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
        } catch (e) {
            console.error('Error rendering detailed chart:', e);
        }
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

CycleChartDetailWidget.template = "vibration_monitor.CycleChartDetailWidget";

// Register widgets
registry.category("fields").add("cycle_chart_widget", {
    component: CycleChartWidget,
});

registry.category("fields").add("cycle_chart_detail_widget", {
    component: CycleChartDetailWidget,
});
