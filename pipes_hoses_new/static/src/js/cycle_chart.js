/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, onMounted, useRef, onWillUnmount, onPatched } from "@odoo/owl";
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

        onPatched(() => {
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

        onPatched(() => {
            this.renderChart();
        });

        onWillUnmount(() => {
            if (this.chart) {
                this.chart.destroy();
            }
        });
    }

    getFrequencyValue() {
        const record = this.props.record;

        // Try to get frequency from multiple possible sources
        // 1. Direct field access
        if (record.data.frequency) return parseFloat(record.data.frequency);
        if (record.data.frequency_value) return parseFloat(record.data.frequency_value);
        if (record.data.frequency_hz) return parseFloat(record.data.frequency_hz);

        // 2. Try from parent/related field (if it's a related record)
        if (record.data.machine_id && record.data.machine_id[0]) {
            // This is for Many2one fields - machine_id[1] would be the name
            const machineId = record.data.machine_id[0];
            // You might need to access it differently based on your model structure
        }

        // 3. Check widget options
        if (this.props.options && this.props.options.frequency) {
            return parseFloat(this.props.options.frequency);
        }

        // 4. Try accessing from record's parent or context
        if (record.context && record.context.default_frequency) {
            return parseFloat(record.context.default_frequency);
        }

        // Log all available data for debugging
        console.log('Record data keys:', Object.keys(record.data));
        console.log('Full record data:', record.data);

        // Default fallback
        return 2;
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

            // Get frequency dynamically
            const frequencyValue = this.getFrequencyValue();
            console.log('Using frequency:', frequencyValue);

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
                            label: `Dimension (MM) - ${frequencyValue}Hz`,
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
                                text: `Time (seconds) - Frequency: ${frequencyValue}Hz`,
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
                                    return value.toFixed(3) + 's';
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
            const frequencyValue = this.getFrequencyValue();

            let csv = 'Type,Degree,Value (MM),Time (s)\n';

            data.actual.forEach(point => {
                const degreeIndex = [0, 45, 90, 135, 180, 225, 270, 315, 360].indexOf(point.degree);
                const timeInCycle = (degreeIndex / 8.0) * (1.0 / frequencyValue);
                csv += `Actual,${point.degree},${point.value},${timeInCycle.toFixed(4)}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.download = `cycle_data_${frequencyValue}Hz_${timestamp}.csv`;
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