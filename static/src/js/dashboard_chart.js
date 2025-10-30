/** @odoo-module **/

import { Component, onMounted, onWillUnmount, useRef, onWillUpdateProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

export class VibrationLiveChartField extends Component {
    static template = "vibration_monitoring.VibrationLiveChartField";
    static props = {
        ...standardFieldProps,
    };

    setup() {
        this.chartRef = useRef("liveChartCanvas");
        this.chart = null;

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
        if (!data || data.length === 0) {
            return;
        }

        const ctx = canvas.getContext('2d');

        // Prepare data for Chart.js
        const labels = data.map(d => d.time_actual.toFixed(4));
        const dimensions = data.map(d => d.dimension);
        const cycles = [...new Set(data.map(d => d.cycle))];

        // Create datasets for each cycle with different colors
        const colors = [
            'rgba(54, 162, 235, 1)',
            'rgba(255, 99, 132, 1)',
            'rgba(75, 192, 192, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(153, 102, 255, 1)',
            'rgba(255, 159, 64, 1)',
            'rgba(199, 199, 199, 1)',
        ];

        const datasets = cycles.map((cycle, index) => {
            const cycleData = data.filter(d => d.cycle === cycle);
            return {
                label: `Cycle ${cycle}`,
                data: cycleData.map(d => ({
                    x: d.time_actual,
                    y: d.dimension
                })),
                borderColor: colors[index % colors.length],
                backgroundColor: colors[index % colors.length].replace('1)', '0.1)'),
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5,
            };
        });

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'Vibration: Dimension vs Time',
                        font: {
                            size: 16
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const dataPoint = data[context.dataIndex];
                                return [
                                    `Cycle: ${dataPoint.cycle}`,
                                    `Time: ${dataPoint.time_actual.toFixed(4)}s`,
                                    `Dimension: ${dataPoint.dimension.toFixed(2)} MM`,
                                    `Degree: ${dataPoint.degree}°`
                                ];
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
                                size: 14
                            }
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(2);
                            }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Dimension (MM)',
                            font: {
                                size: 14
                            }
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
    }
}

registry.category("fields").add("vibration_live_chart", {
    component: VibrationLiveChartField,
});
