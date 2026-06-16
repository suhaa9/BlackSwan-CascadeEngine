// Minimalist 'Bento Refined' Scripting
Chart.defaults.color = '#71717A';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 10;
Chart.defaults.font.weight = 600;

let performanceChart = null;

const form = document.getElementById('simulation-form');
const btn = document.getElementById('run-btn');
const statusDot = document.getElementById('system-status-dot');
const statusText = document.getElementById('system-status-text');
const canvas = document.getElementById('resultsChart');
const emptyState = document.getElementById('empty-state');
const emptyStateText = document.getElementById('empty-state-text');
const chartLoader = document.getElementById('chart-loader');
const breakPointAnnotation = document.getElementById('break-point-annotation');

// Debounce helper
function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

// Metrics elements
const statLatency = document.getElementById('stat-latency');
const statBreak = document.getElementById('stat-break');
const statCascade = document.getElementById('stat-cascade');
const statNodes = document.getElementById('stat-nodes');

// Table elements
const resultsTableTile = document.getElementById('results-table-tile');
const tableHead = document.getElementById('table-head-row');
const tableBody = document.getElementById('table-body');

// Navigation
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.bento-section');

let simulationTemplates = [];
let selectedTemplate = null;

// Scroll Management
// Native anchor scrolling is used with Intersection Observer for active nav highlighting.

const BACKEND_STAGES = [
    "Request sent...",
    "Initializing Fracture Simulation...",
    "Scaling Network Dimensions...",
    "Mapping Risk Topologies...",
    "Finalizing Matrices..."
];

let stageInterval = null;

function renderStages(container, currentStageIndex) {
    if (!container) return;
    const stage = BACKEND_STAGES[currentStageIndex];
    if (stage) {
        container.innerHTML = `<div class="stage-item active"><span>◎</span> ${stage}</div>`;
    }
}

function startBackendStages(triggeringButtonId) {
    let container = null;
    if (triggeringButtonId) {
        const btnElement = document.getElementById(triggeringButtonId);
        if (btnElement) {
            container = btnElement.nextElementSibling;
        }
    }

    if (!container || !container.classList.contains('backend-stages')) {
        document.querySelectorAll('.backend-stages').forEach(el => {
            el.innerHTML = ''; // clear
            renderStages(el, 0);
        });
    } else {
        document.querySelectorAll('.backend-stages').forEach(el => {
            if (el !== container) el.innerHTML = '';
        });
        renderStages(container, 0);
    }

    let currentStage = 0;
    stageInterval = setInterval(() => {
        if (currentStage < BACKEND_STAGES.length - 1) {
            currentStage++;
            document.querySelectorAll('.backend-stages').forEach(el => {
                if (el.innerHTML !== '') renderStages(el, currentStage);
            });
        }
    }, 400);
}

function completeBackendStages() {
    if (stageInterval) clearInterval(stageInterval);
    document.querySelectorAll('.backend-stages').forEach(el => {
        if (el.innerHTML !== '') {
            el.innerHTML = `<div class="stage-item done"><span>●</span> Request Complete</div>`;
            setTimeout(() => {
                el.innerHTML = ''; // Clear so it's empty space
            }, 2500);
        }
    });
}


form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const triggerId = window._lastTriggeredButton || (e.submitter && e.submitter.id) || 'run-btn';
    window._lastTriggeredButton = null;
    startBackendStages(triggerId);

    // UI State
    btn.disabled = true;
    btn.style.opacity = "0.5";
    if (statusDot) statusDot.style.background = "#F59E0B";
    if (statusText) statusText.innerText = "CALCULATING";

    canvas.style.display = 'none';
    emptyState.style.display = 'flex';
    emptyStateText.innerText = "CALCULATING FRACTURE DATA...";
    chartLoader.classList.remove('hidden');
    resultsTableTile.classList.add('hidden');

    const isDecisionMode = !document.getElementById('decision-mode-content').classList.contains('hidden');
    let payload;

    if (isDecisionMode) {
        const scenarioCard = document.querySelector('.decision-card.selected');
        const scenario = scenarioCard.dataset.scenario;
        payload = getScenarioPayload(scenario);
        payload.mode = scenario;
    } else {
        payload = {
            densities: document.getElementById('densities').value,
            dimension_scales: document.getElementById('dimension_scales').value,
            regions: document.getElementById('regions').value,
            scenarios: document.getElementById('scenarios').value,
            initial_shock: document.getElementById('initial_shock').value,
            time_units: document.getElementById('time_units').value,
            num_nodes: document.getElementById('num_nodes').value,
            mode: 'custom'
        };
    }

    try {
        const response = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const data = await response.json();

        if (data.error) {
            alert(`Simulation Error: ${data.error}`);
        } else {
            renderChart(data);
            updateStats(data, payload);
            populateTable(data);
            generateAnalystReport(data, payload);

            resultsTableTile.classList.remove('hidden');

            if (data.hasBroken) {
                breakPointAnnotation.classList.remove('hidden');
            } else {
                breakPointAnnotation.classList.add('hidden');
            }

            // Auto-scroll to Outcome Analyst if in Decision Mode
            if (isDecisionMode) {
                setTimeout(() => {
                    const outcomeSection = document.getElementById('outcome-section');
                    outcomeSection.scrollIntoView({ behavior: 'smooth' });
                }, 1000);
            }
        }
    } catch (err) {
        console.error("Link Failure", err);
    } finally {
        completeBackendStages();
        btn.disabled = false;
        btn.style.opacity = "1";
        chartLoader.classList.add('hidden');
        emptyStateText.innerText = "Set your stress parameters. Run the test. Find the break point.";
        if (statusDot) statusDot.style.background = "#10B981";
        if (statusText) statusText.innerText = "STANDBY";
    }
});

/**
 * Returns N discrete colors from a standard high-contrast palette
 */
function getStandardPalette(n) {
    const standardColors = [
        '#2563EB', // Blue
        '#DC2626', // Red
        '#10B981', // Emerald
        '#F59E0B', // Amber/Orange
        '#7C3AED', // Purple
        '#0891B2', // Cyan
        '#EA580C', // Orange
        '#4F46E5', // Indigo
        '#BE185D'  // Pink
    ];

    const palette = [];
    for (let i = 0; i < n; i++) {
        palette.push(standardColors[i % standardColors.length]);
    }
    return palette;
}

function updateStats(data, payload) {
    if (!data || !data.datasets || data.datasets.length === 0) return;

    // Calculate absolute max impact (Cascade Cost)
    let maxVal = 0;
    data.datasets.forEach(ds => {
        const m = Math.max(...ds.data.filter(v => v !== null));
        if (m > maxVal) maxVal = m;
    });

    // Cascade Cost: Absolute maximum impact across all scales
    statLatency.innerText = Math.round(maxVal).toLocaleString();

    // Break Point: Provided by backend systemic trigger
    statBreak.innerText = data.hasBroken ? data.breakPointDensity : "Safe";

    // Cascade Factor: Provided by backend intensity multiplier
    const factor = data.factor || 1.0;
    statCascade.innerText = factor.toFixed(2);

    // Total Nodes in biggest scale
    statNodes.innerText = payload.num_nodes ? Number(payload.num_nodes).toLocaleString() : "—";
}

function getScenarioPayload(scenario) {
    const scenarios = {
        'isolated': {
            densities: "0.05, 0.1, 0.15, 0.2, 0.25, 0.3",
            dimension_scales: "50, 100, 150, 200, 250",
            regions: "10", scenarios: "5", time_units: "48", num_nodes: "500", initial_shock: "500000"
        },
        'regional': {
            densities: "0.5, 1.0, 1.5, 2.0, 2.5, 3.0",
            dimension_scales: "100, 200, 300, 400, 500",
            regions: "25", scenarios: "15", time_units: "72", num_nodes: "1000", initial_shock: "2000000"
        },
        'systemic': {
            densities: "2.0, 4.0, 6.0, 8.0, 10.0, 12.0",
            dimension_scales: "200, 400, 600, 800, 1000",
            regions: "50", scenarios: "30", time_units: "96", num_nodes: "2000", initial_shock: "10000000"
        },
        'black_swan': {
            densities: "5.0, 8.0, 12.0, 15.0, 18.0, 22.0",
            dimension_scales: "300, 600, 900, 1200, 1500",
            regions: "80", scenarios: "50", time_units: "120", num_nodes: "3500", initial_shock: "50000000"
        }
    };
    return scenarios[scenario];
}

function generateAnalystReport(data, payload) {
    try {
        if (!data || !data.datasets || data.datasets.length === 0) return;

        const hasBroken = data.hasBroken;
        const bpDensity = data.breakPointDensity;
        const factor = data.factor || 1.0;

        let maxVal = 0;
        data.datasets.forEach(ds => {
            const m = Math.max(...ds.data.filter(v => v !== null));
            if (m > maxVal) maxVal = m;
        });

        const outcomeSummary = document.getElementById('outcome-summary');
        const outcomeAction = document.getElementById('outcome-action');
        const outcomeChip = document.getElementById('outcome-chip');
        const exLatency = document.getElementById('ex-latency-val');
        const exBreak = document.getElementById('ex-break-val');
        const exFactor = document.getElementById('ex-factor-val');
        const trendDesc = document.getElementById('visual-trend-desc');

        if (exLatency) exLatency.innerText = `${Math.round(maxVal).toLocaleString()}`;
        if (exBreak) exBreak.innerText = hasBroken ? bpDensity : "Safe";
        if (exFactor) exFactor.innerText = `${factor.toFixed(2)}x`;

        const bpValue = hasBroken ? parseFloat(bpDensity) : -1;

        let isTerminal = false;
        let isFragile = false;
        let isContained = false;
        let isRobust = false;

        if (factor <= 10) {
            isRobust = true;
        } else if (factor <= 25) {
            isContained = true;
        } else if (factor <= 45) {
            isFragile = true;
        } else {
            isTerminal = true; // Captures >= 50 and values > 45
        }

        let summaryText = "";
        let actionText = "";
        let chipText = "";
        let chipColor = "";

        if (isTerminal) {
            summaryText = `Terminal systemic failure. The system reached a critical 'Break Point' at ${bpDensity} density. Total collapse is imminent due to high-connectivity fracture.`;
            actionText = "Execute total network decoupling. Structural reset of all nodes required. Decouple systemic hubs immediately.";
            chipText = "BLACK SWAN EVENT";
            chipColor = "#ea4335";
        }
        else if (isFragile) {
            summaryText = `Critical fragility detected. A break point occurred at ${bpDensity} density. The network is unable to absorb further shocks without a complete systemic shift.`;
            actionText = "Dilute hub concentration. Diversify regional connection paths. Current weights suggest a 'Hub-and-Spoke' vulnerability.";
            chipText = "SYSTEMIC FRAGILITY";
            chipColor = "#FBBC04";
        }
        else if (isContained) {
            summaryText = `System stressed but contained. The break point at ${bpDensity} density indicates manageable propagation within safe margins.`;
            actionText = "Monitor regional clusters. Risk is leaking slowly between nodes but hasn't hit exponential thresholds.";
            chipText = "REGIONAL STRESS";
            chipColor = "#4285f4";
        }
        else {
            summaryText = "Highly robust network topology. System successfully absorbed all shock parameters or broke at a safe, localized density.";
            actionText = "Maintain current topology. The system has significant capacity for increased density or higher initial shock thresholds.";
            chipText = "ISOLATED INCIDENT";
            chipColor = "#34a853";
        }



        if (outcomeSummary) outcomeSummary.innerText = summaryText;
        if (outcomeAction) outcomeAction.innerText = actionText;
        if (outcomeChip) {
            outcomeChip.innerText = chipText;
            outcomeChip.style.background = chipColor;
            outcomeChip.style.color = "#FFF"; // Ensure white text for all risk chips
        }

        if (trendDesc) {
            if (hasBroken) {
                trendDesc.innerText = `Non-linear fracture detected at ${bpDensity} density. The 'Exponential Spike' signifies a loss of system control where growth exceeds recovery thresholds.`;
            } else if (factor > 2.0) {
                trendDesc.innerText = "The 'Parabolic Acceleration' shows risk growing steadily with density. While contained, it indicates increasing systemic friction.";
            } else {
                trendDesc.innerText = "The 'Flat Baseline' indicates total resilience. Shocks are absorbed at the point of origin with zero propagation.";
            }
        }
    } catch (e) {
        console.error("Report Generation Error:", e);
    }
}

function populateTable(data) {
    // Headers
    tableHead.innerHTML = '<th>Step (Density)</th>' +
        data.datasets.map(ds => `<th>Scale: ${ds.label}</th>`).join('');

    // Rows
    tableBody.innerHTML = '';
    data.labels.forEach((label, i) => {
        const row = document.createElement('tr');
        let rowHtml = `<td>${label}</td>`;
        data.datasets.forEach(ds => {
            const val = ds.data[i];
            rowHtml += `<td>${val ? Math.round(val).toLocaleString() : '—'}</td>`;
        });
        row.innerHTML = rowHtml;
        tableBody.appendChild(row);
    });
}

function renderChart(data) {
    emptyState.style.display = 'none';
    chartLoader.classList.add('hidden'); // Ensure loader is hidden when chart shows
    canvas.style.display = 'block';

    if (performanceChart) performanceChart.destroy();

    const colors = getStandardPalette(data.datasets.length);

    const datasets = data.datasets.map((ds, index) => {
        const color = colors[index];
        return {
            label: ds.label,
            data: ds.data.map(y => y === 0 ? null : y),
            borderColor: color,
            borderWidth: 2.0, // Thinned out for analytical density (prev 4.5)
            pointRadius: 0,
            pointHoverRadius: 5, // Balanced hover feel
            pointBackgroundColor: color,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: 0,
            fill: false
        };
    });

    performanceChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: data.labels.map(l => String(l)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    backgroundColor: '#18181B',
                    titleColor: '#FFF',
                    cornerRadius: 6,
                    padding: 12
                },
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 8,
                        usePointStyle: true,
                        font: { weight: '700', size: 10 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { weight: 700 } }
                },
                y: {
                    type: 'logarithmic',
                    grid: { color: '#F1F5F9' },
                    ticks: { font: { weight: 700 } },
                    border: { display: false }
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            }
        }
    });
}

// --- Event Analyzer Logic ---

async function loadTemplates() {
    try {
        const response = await fetch('template.json');
        const data = await response.json();
        simulationTemplates = data.simulations;
        renderTemplateDropdown();
    } catch (err) {
        console.error("Failed to load templates:", err);
    }
}

function renderTemplateDropdown() {
    const list = document.getElementById('template-dropdown-list');
    const btn = document.getElementById('template-dropdown-btn');

    list.innerHTML = simulationTemplates.map((sim, index) => `
        <div class="template-option" data-index="${index}">
            ${sim.event}
        </div>
    `).join('');

    // Toggle Dropdown
    btn.onclick = (e) => {
        e.stopPropagation();
        const isOpen = btn.classList.toggle('open');
        list.classList.toggle('open');

        // Ensure the parent tile has high z-index when open to avoid clipping by next section
        const parentTile = btn.closest('.tile');
        if (parentTile) {
            parentTile.style.zIndex = isOpen ? "1000" : "1";
        }
    };

    // Close on click outside
    document.addEventListener('click', () => {
        btn.classList.remove('open');
        list.classList.remove('open');
        const parentTile = btn.closest('.tile');
        if (parentTile) parentTile.style.zIndex = "1";
    });

    // Select Template
    list.querySelectorAll('.template-option').forEach(option => {
        option.onclick = () => {
            const index = option.dataset.index;
            selectTemplate(simulationTemplates[index]);
            btn.querySelector('span').innerText = simulationTemplates[index].event;
        };
    });
}

function selectTemplate(template) {
    selectedTemplate = template;

    // Show details
    const details = document.getElementById('selected-template-details');
    details.classList.remove('hidden');
    document.getElementById('template-event-name').innerText = template.event;
    document.getElementById('template-event-desc').innerText =
        `Historical mapping: ${template.stress_parameters.scale} scale event with ${template.stress_parameters.propagation_type} propagation.`;

    // Update Translation Grid (Helping users understand the mapping)
    document.getElementById('rw-complexity').innerText = `Complexity: ${template.stress_parameters.propagation_type.replace('_', ' ')}`;
    document.getElementById('mi-density').innerText = `Density: ${template.stress_parameters.density}`;

    document.getElementById('rw-scope').innerText = `Horizon: ${template.stress_parameters.time_horizon.replace('_', ' ')}`;
    document.getElementById('mi-regions').innerText = `Scale Points: ${template.risk_cube_dimensions.regions.length}`;

    document.getElementById('rw-severity').innerText = `Impact: ${(template.stress_parameters.shock_magnitude * 100).toFixed(0)}% Intensity`;
    document.getElementById('mi-shock').innerText = `Shock: ${(1000000 * template.stress_parameters.shock_magnitude).toLocaleString()}`;

    // Update Risk Cube Lists
    renderList('assets-list', template.risk_cube_dimensions.assets);
    renderList('regions-list', template.risk_cube_dimensions.regions);
    renderList('scenarios-list', template.risk_cube_dimensions.scenarios);
}

function renderList(id, items) {
    const el = document.getElementById(id);
    el.innerHTML = items.map(item => `<li>${item.replace(/_/g, ' ')}</li>`).join('');
}

// Apply Template & Run
document.getElementById('apply-template-btn').onclick = () => {
    if (!selectedTemplate) return;

    // 1. Populate main form
    const p = selectedTemplate.stress_parameters;
    const d = selectedTemplate.risk_cube_dimensions;

    // Model specific translation:
    // We map the single density to a range for the chart visualization
    const densityVal = p.density;
    document.getElementById('densities').value = `${(densityVal * 0.4).toFixed(2)}, ${(densityVal * 0.7).toFixed(2)}, ${densityVal.toFixed(2)}, ${(densityVal * 1.3).toFixed(2)}, ${(densityVal * 1.8).toFixed(2)}, ${(densityVal * 2.5).toFixed(2)}`;

    // Context-aware dimension scales based on event intensity
    const intensity = p.shock_magnitude;
    if (intensity > 0.9) {
        document.getElementById('dimension_scales').value = "50, 150, 350, 600, 1000";
    } else if (intensity > 0.7) {
        document.getElementById('dimension_scales').value = "25, 100, 250, 500, 750";
    } else {
        document.getElementById('dimension_scales').value = "10, 50, 150, 300, 450";
    }

    document.getElementById('regions').value = d.regions.length * 8;
    document.getElementById('scenarios').value = d.scenarios.length * 10;
    document.getElementById('initial_shock').value = 1000000 * p.shock_magnitude;
    document.getElementById('time_units').value = parseInt(p.time_horizon.split('_')[0].substring(2)) || 24;
    document.getElementById('num_nodes').value = intensity > 0.8 ? 4000 : 2000;

    // 2. Switch to simulation tab
    navLinks[0].click();

    // 3. Trigger submit
    window._lastTriggeredButton = 'apply-template-btn';
    form.requestSubmit();
};

// --- Mode Switching & Decision Logic ---
document.getElementById('toggle-expert').onclick = () => {
    document.getElementById('simulation-form').classList.remove('hidden');
    document.getElementById('decision-mode-content').classList.add('hidden');
    document.getElementById('toggle-expert').classList.add('active');
    document.getElementById('toggle-decision').classList.remove('active');
};

document.getElementById('toggle-decision').onclick = () => {
    document.getElementById('simulation-form').classList.add('hidden');
    document.getElementById('decision-mode-content').classList.remove('hidden');
    document.getElementById('toggle-expert').classList.remove('active');
    document.getElementById('toggle-decision').classList.add('active');
};

document.querySelectorAll('.decision-card').forEach(card => {
    card.onclick = () => {
        document.querySelectorAll('.decision-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        // Sync Decision Mode with Expert Mode Inputs
        const scenarioData = getScenarioPayload(card.dataset.scenario);
        if (scenarioData) {
            document.getElementById('densities').value = scenarioData.densities;
            document.getElementById('dimension_scales').value = scenarioData.dimension_scales;
            document.getElementById('regions').value = scenarioData.regions;
            document.getElementById('scenarios').value = scenarioData.scenarios;
            document.getElementById('initial_shock').value = scenarioData.initial_shock;
            document.getElementById('time_units').value = scenarioData.time_units;
            document.getElementById('num_nodes').value = scenarioData.num_nodes;
        }
    };
});

document.getElementById('decision-run-btn').onclick = () => {
    window._lastTriggeredButton = 'decision-run-btn';
    form.requestSubmit();
};

// --- Scroll-Position Dependent Animations ---
function initScrollAnimations() {
    const tiles = document.querySelectorAll('.tile');
    const sections = document.querySelectorAll('.bento-section');
    const navLinks = document.querySelectorAll('.nav-link');

    function updateAnimations() {
        const vh = window.innerHeight;
        const threshold = vh * 0.15; // Reduced from 0.3 for snappier transitions

        tiles.forEach(tile => {
            const rect = tile.getBoundingClientRect();
            let progress = 1;

            if (rect.top > vh - threshold) {
                const dist = rect.top - (vh - threshold);
                progress = Math.max(0, 1 - (dist / threshold));
            }
            else if (rect.bottom < threshold) {
                const dist = threshold - rect.bottom;
                progress = Math.max(0, 1 - (dist / threshold));
            }

            // Buttery Smooth 'Smoothstep' Easing (3x^2 - 2x^3)
            const easedProgress = progress * progress * (3 - 2 * progress);

            // Apply transformations with softer intensities
            tile.style.opacity = Math.max(0.15, easedProgress);
            tile.style.filter = `blur(${(1 - easedProgress) * 8}px)`;
            tile.style.transform = `translateY(${(1 - easedProgress) * 20}px) scale(${0.98 + (easedProgress * 0.02)})`;
        });

        // Navigation Tracking
        let current = "";
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (window.pageYOffset >= (sectionTop - 300)) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').includes(current)) {
                link.classList.add('active');
            }
        });

        requestAnimationFrame(updateAnimations);
    }

    // Start loop
    requestAnimationFrame(updateAnimations);
}

// Tooltip Logic
function initTooltips() {
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'premium-tooltip hidden';
    document.body.appendChild(tooltipEl);

    document.querySelectorAll('[data-tooltip]').forEach(el => {
        el.addEventListener('mouseenter', (e) => {
            const content = el.getAttribute('data-tooltip');
            tooltipEl.innerText = content;
            tooltipEl.classList.remove('hidden');
        });

        el.addEventListener('mousemove', (e) => {
            const x = e.clientX;
            const y = e.clientY;

            // Offset to prevent covering the cursor
            tooltipEl.style.left = `${x + 20}px`;
            tooltipEl.style.top = `${y + 20}px`;
        });

        el.addEventListener('mouseleave', () => {
            tooltipEl.classList.add('hidden');
        });
    });
}

// Initial State
window.addEventListener('DOMContentLoaded', () => {
    initScrollAnimations();
    loadTemplates();
    initTooltips();

    // Initialize default scenario (Systemic Fragility)
    const defaultCard = document.querySelector('.decision-card.selected');
    if (defaultCard) {
        const scenarioData = getScenarioPayload(defaultCard.dataset.scenario);
        if (scenarioData) {
            document.getElementById('densities').value = scenarioData.densities;
            document.getElementById('dimension_scales').value = scenarioData.dimension_scales;
            document.getElementById('regions').value = scenarioData.regions;
            document.getElementById('scenarios').value = scenarioData.scenarios;
            document.getElementById('initial_shock').value = scenarioData.initial_shock;
            document.getElementById('time_units').value = scenarioData.time_units;
            document.getElementById('num_nodes').value = scenarioData.num_nodes;
        }
    }
});
