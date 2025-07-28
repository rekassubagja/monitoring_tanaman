const API_KEY = '5b7fb90b1dec5309ecaa236b414b0ccb';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
let currentCity = 'Jakarta';
let soilChart;
let sensorData = [];

// MQTT Configuration
const MQTT_CONFIG = {
    host: 'e8600f280ce3482996633b26e5c91eff.s1.eu.hivemq.cloud',
    port: 8884,
    clientId: 'WebClient_' + Math.random().toString(16).substr(2, 8),
    username: 'esp32',
    password: 'Babacang2824',
    useSSL: true
};

let mqttClient = null;
let isConnected = false;

// Weather icons mapping
const weatherIcons = {
    '01d': '☀️', '01n': '🌙',
    '02d': '⛅', '02n': '☁️',
    '03d': '☁️', '03n': '☁️',
    '04d': '☁️', '04n': '☁️',
    '09d': '🌦️', '09n': '🌦️',
    '10d': '🌧️', '10n': '🌧️',
    '11d': '⛈️', '11n': '⛈️',
    '13d': '🌨️', '13n': '🌨️',
    '50d': '🌫️', '50n': '🌫️'
};

// Soil condition mapping
function getSoilCondition(moisture) {
    if (moisture >= 80) {
        return { text: 'Sangat Basah', icon: '💧' };
    } else if (moisture >= 60) {
        return { text: 'Basah', icon: '🌊' };
    } else if (moisture >= 40) {
        return { text: 'Lembab', icon: '🌱' };
    } else if (moisture >= 20) {
        return { text: 'Kering', icon: '🍂' };
    } else {
        return { text: 'Sangat Kering', icon: '🏜️' };
    }
}

// Initialize MQTT connection
function initMQTT() {
    console.log('Initializing MQTT connection...');
    
    mqttClient = new Paho.MQTT.Client(
        MQTT_CONFIG.host,
        MQTT_CONFIG.port,
        MQTT_CONFIG.clientId
    );

    mqttClient.onConnectionLost = onConnectionLost;
    mqttClient.onMessageArrived = onMessageArrived;

    const connectOptions = {
        useSSL: MQTT_CONFIG.useSSL,
        userName: MQTT_CONFIG.username,
        password: MQTT_CONFIG.password,
        onSuccess: onConnect,
        onFailure: onConnectFailure
    };

    mqttClient.connect(connectOptions);
}

function onConnect() {
    console.log('MQTT Connected');
    isConnected = true;
    updateMQTTStatus(true);
    
    // Subscribe to soil moisture topic
    mqttClient.subscribe('esp32/soil');
    console.log('Subscribed to esp32/soil');
}

function onConnectFailure(error) {
    console.log('MQTT Connection failed: ', error);
    isConnected = false;
    updateMQTTStatus(false);
    
    // Retry connection after 5 seconds
    setTimeout(initMQTT, 5000);
}

function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log('MQTT Connection lost: ' + responseObject.errorMessage);
        isConnected = false;
        updateMQTTStatus(false);
        
        // Try to reconnect
        setTimeout(initMQTT, 5000);
    }
}

function onMessageArrived(message) {
    console.log('Message arrived: ' + message.payloadString);
    
    try {
        const data = JSON.parse(message.payloadString);
        updateSensorDisplay(data);
    } catch (error) {
        console.error('Error parsing MQTT message:', error);
    }
}

function updateMQTTStatus(connected) {
    const statusIcon = document.getElementById('mqttStatusIcon');
    const statusText = document.getElementById('mqttStatusText');
    
    if (connected) {
        statusIcon.textContent = '🟢';
        statusText.textContent = 'MQTT Connected';
        statusText.className = 'mqtt-connected';
    } else {
        statusIcon.textContent = '🔴';
        statusText.textContent = 'MQTT Disconnected';
        statusText.className = 'mqtt-disconnected';
    }
}

function updateSensorDisplay(data) {
    const moisture = data.moisture_percent;
    const timestamp = new Date().toLocaleTimeString('id-ID');
    
    // Update sensor values
    document.getElementById('sensorValue').textContent = moisture;
    document.getElementById('sensorBar').style.width = `${moisture}%`;
    document.getElementById('sensorTime').textContent = timestamp;
    
    // Update sensor status
    document.getElementById('sensorStatusDot').classList.remove('offline');
    document.getElementById('sensorStatusText').textContent = 'Online';
    
    // Update soil condition
    const condition = getSoilCondition(moisture);
    document.getElementById('conditionIcon').textContent = condition.icon;
    document.getElementById('conditionText').textContent = condition.text;
    
    // Update chart
    updateChartData(moisture, timestamp);
    
    // Update last update time
    document.getElementById('lastUpdateTime').textContent = new Date().toLocaleString('id-ID');
}

// Initialize chart
function initializeChart() {
    const ctx = document.getElementById('soilChart').getContext('2d');
    soilChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Kelembaban Tanah (%)',
                data: [],
                borderColor: '#4a7c59',
                backgroundColor: 'rgba(74, 124, 89, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: {
                        color: '#e8f5e8'
                    },
                    ticks: {
                        color: '#5a7c47'
                    }
                },
                x: {
                    grid: {
                        color: '#e8f5e8'
                    },
                    ticks: {
                        color: '#5a7c47'
                    }
                }
            }
        }
    });
}

// Update chart data
function updateChartData(value, time) {
    sensorData.push({
        time: time,
        value: value
    });

    // Keep only last 20 data points
    if (sensorData.length > 20) {
        sensorData.shift();
    }

    // Update chart
    soilChart.data.labels = sensorData.map(d => d.time);
    soilChart.data.datasets[0].data = sensorData.map(d => d.value);
    soilChart.update();
}

// Load weather data
async function loadWeatherData() {
    try {
        const response = await fetch(`${BASE_URL}/weather?q=${currentCity}&appid=${API_KEY}&units=metric&lang=id`);
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}: Gagal memuat data cuaca`);
        }
        
        const data = await response.json();
        updateWeatherDisplay(data);
        
    } catch (error) {
        document.getElementById('weatherLoading').style.display = 'none';
        document.getElementById('weatherError').style.display = 'block';
        document.getElementById('weatherError').innerHTML = `
            <div class="error">Error: ${error.message}</div>
        `;
    }
}

// Update weather display
function updateWeatherDisplay(data) {
    document.getElementById('weatherLoading').style.display = 'none';
    document.getElementById('weatherInfo').style.display = 'grid';
    
    document.getElementById('weatherIcon').textContent = weatherIcons[data.weather[0].icon] || '🌤️';
    document.getElementById('temperature').textContent = `${Math.round(data.main.temp)}°C`;
    document.getElementById('weatherDesc').textContent = data.weather[0].description;
    document.getElementById('airHumidity').textContent = `${data.main.humidity}%`;
    document.getElementById('pressure').textContent = `${data.main.pressure} hPa`;
    document.getElementById('windSpeed').textContent = `${Math.round((data.wind?.speed || 0) * 3.6)} km/h`;
}

// Change city
function changeCity() {
    currentCity = document.getElementById('citySelect').value;
    document.getElementById('weatherLoading').style.display = 'block';
    document.getElementById('weatherInfo').style.display = 'none';
    document.getElementById('weatherError').style.display = 'none';
    loadWeatherData();
}

// Refresh all data
function refreshAllData() {
    // Refresh weather data
    document.getElementById('weatherLoading').style.display = 'block';
    document.getElementById('weatherInfo').style.display = 'none';
    document.getElementById('weatherError').style.display = 'none';
    
    loadWeatherData();
    
    // Update last update time
    document.getElementById('lastUpdateTime').textContent = new Date().toLocaleString('id-ID');
}

// Auto-refresh weather
function startWeatherRefresh() {
    setInterval(() => {
        loadWeatherData();
    }, 600000); // 10 minutes
}

// Initialize on page load
window.addEventListener('load', () => {
    initializeChart();
    loadWeatherData();
    initMQTT();
    document.getElementById('lastUpdateTime').textContent = new Date().toLocaleString('id-ID');
    
    // Start auto refresh for weather
    startWeatherRefresh();
});

// Console messages
console.log('🌱 Smart Agriculture Monitoring System');
console.log('📡 MQTT connection to HiveMQ Cloud');
console.log('📊 Waiting for real sensor data from ESP32...');
console.log('🌤️ Weather data will update every 10 minutes');