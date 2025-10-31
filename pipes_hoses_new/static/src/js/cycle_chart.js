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

            // Prepare data points using time for x-axis
            const actualData = data.actual.map(d => ({
                x: d.time || 0,
                y: d.value
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

            // Use time values directly from the data
            const plannedData = data.planned.map(d => ({
                x: d.time,
                y: d.value,
                degree: d.degree,
                cycle: d.cycle,
                dimension: d.value
            }));

            const actualData = data.actual.map(d => ({
                x: d.time,
                y: d.value,
                degree: d.degree,
                cycle: d.cycle,
                dimension: d.value
            }));

            // Create detailed chart showing all cycles in 1 second
            this.chart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [
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
                            showLine: true,
                        },
                        {
                            label: 'Actual',
                            data: actualData,
                            borderColor: 'rgb(0, 0, 0)', // Black
                            backgroundColor: 'rgba(0, 0, 0, 0.1)',
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
                                    return `Cycle ${point.cycle} - ${point.degree}° - ${point.x.toFixed(4)}s`;
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
                            max: 1.0, // Always 1 second
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
            let csv = 'Type,Cycle,Degree,Time(s),Value (MM)\n';

            data.actual.forEach(point => {
                csv += `Actual,${point.cycle},${point.degree},${point.time},${point.value}\n`;
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