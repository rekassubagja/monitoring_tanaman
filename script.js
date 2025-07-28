// HiveMQ Cloud Configuration
const MQTT_CONFIG = {
  broker: 'wss://e8600f280ce3482996633b26e5c91eff.s1.eu.hivemq.cloud:8884/mqtt',
  username: 'esp32',
  password: 'Babacang2824',
  clientId: 'robot_control_' + Math.random().toString(16).substr(2, 8),
  topic: 'robot/control'
};

// Global Variables
let mqttClient = null;
let isConnected = false;
let autoMode = false;
let pumpActive = false;
let currentCommand = 0;

// Button states to prevent conflicts
let buttonStates = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  pump: false
};

// Command Codes
const COMMANDS = {
  STOP: 0,
  FORWARD: 1,
  BACKWARD: 2,
  LEFT: 3,
  RIGHT: 4,
  PUMP_OFF: 5,
  PUMP_ON: 6,
  AUTO_ON: 7,
  AUTO_OFF: 8
};

// DOM Elements
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  statusText: document.getElementById('statusText'),
  forwardBtn: document.getElementById('forwardBtn'),
  backwardBtn: document.getElementById('backwardBtn'),
  leftBtn: document.getElementById('leftBtn'),
  rightBtn: document.getElementById('rightBtn'),
  autoButton: document.getElementById('autoButton'),
  pumpButton: document.getElementById('pumpButton')
};

// Initialize MQTT Connection
function initMQTT() {
  try {
    mqttClient = mqtt.connect(MQTT_CONFIG.broker, {
      username: MQTT_CONFIG.username,
      password: MQTT_CONFIG.password,
      clientId: MQTT_CONFIG.clientId,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000
    });

    mqttClient.on('connect', function () {
      console.log('Connected to HiveMQ Cloud');
      isConnected = true;
      updateConnectionStatus(true);
    });

    mqttClient.on('error', function (error) {
      console.error('MQTT Connection Error:', error);
      isConnected = false;
      updateConnectionStatus(false);
    });

    mqttClient.on('offline', function () {
      console.log('MQTT Client Offline');
      isConnected = false;
      updateConnectionStatus(false);
    });

    mqttClient.on('reconnect', function () {
      console.log('Reconnecting to MQTT...');
      updateConnectionStatus(false, 'Menghubungkan...');
    });

  } catch (error) {
    console.error('Failed to initialize MQTT:', error);
    updateConnectionStatus(false);
  }
}

// Update Connection Status
function updateConnectionStatus(connected, customText = null) {
  const statusElement = elements.connectionStatus;
  const textElement = elements.statusText;
  
  if (connected) {
    statusElement.className = 'status-indicator connected';
    textElement.textContent = '🟢 TERHUBUNG';
  } else {
    statusElement.className = 'status-indicator disconnected';
    textElement.textContent = customText || '🔴 TERPUTUS';
  }
}

// Send Command to Robot
function sendCommand(command) {
  if (!isConnected || !mqttClient) {
    console.error('MQTT not connected');
    return;
  }

  // Prevent manual movement when auto mode is active
  if (autoMode && [COMMANDS.FORWARD, COMMANDS.BACKWARD, COMMANDS.LEFT, COMMANDS.RIGHT].includes(command)) {
    console.log('Manual movement disabled in auto mode');
    return;
  }

  try {
    mqttClient.publish(MQTT_CONFIG.topic, command.toString(), { qos: 0 });
    console.log(`Command sent: ${command}`);
    currentCommand = command;
  } catch (error) {
    console.error('Error sending command:', error);
  }
}

// Generic button press handler
function handleButtonPress(buttonKey, command, element) {
  if (autoMode && buttonKey !== 'pump') return;
  
  if (!buttonStates[buttonKey]) {
    buttonStates[buttonKey] = true;
    element.classList.add('active');
    sendCommand(command);
    console.log(`${buttonKey} button pressed`);
  }
}

// Generic button release handler
function handleButtonRelease(buttonKey, element) {
  if (buttonStates[buttonKey]) {
    buttonStates[buttonKey] = false;
    element.classList.remove('active');
    
    if (buttonKey === 'pump') {
      pumpActive = false;
      sendCommand(COMMANDS.PUMP_OFF);
    } else if (!autoMode) {
      sendCommand(COMMANDS.STOP);
    }
    console.log(`${buttonKey} button released`);
  }
}

// Direction Button Event Handlers - Improved Version
function setupDirectionButtons() {
  const directionButtons = [
    { element: elements.forwardBtn, pressCmd: COMMANDS.FORWARD, key: 'forward' },
    { element: elements.backwardBtn, pressCmd: COMMANDS.BACKWARD, key: 'backward' },
    { element: elements.leftBtn, pressCmd: COMMANDS.LEFT, key: 'left' },
    { element: elements.rightBtn, pressCmd: COMMANDS.RIGHT, key: 'right' }
  ];

  directionButtons.forEach(btn => {
    // Prevent default behaviors
    btn.element.addEventListener('dragstart', e => e.preventDefault());
    btn.element.addEventListener('selectstart', e => e.preventDefault());
    btn.element.addEventListener('contextmenu', e => e.preventDefault());
    
    // Mouse Events
    btn.element.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      handleButtonPress(btn.key, btn.pressCmd, this);
    });

    btn.element.addEventListener('mouseup', function(e) {
      e.preventDefault();
      e.stopPropagation();
      handleButtonRelease(btn.key, this);
    });

    btn.element.addEventListener('mouseleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      handleButtonRelease(btn.key, this);
    });

    // Touch Events - More reliable handling
    btn.element.addEventListener('touchstart', function(e) {
      e.preventDefault();
      e.stopPropagation();
      handleButtonPress(btn.key, btn.pressCmd, this);
    }, { passive: false });

    btn.element.addEventListener('touchend', function(e) {
      e.preventDefault();
      e.stopPropagation();
      handleButtonRelease(btn.key, this);
    }, { passive: false });

    btn.element.addEventListener('touchcancel', function(e) {
      e.preventDefault();
      e.stopPropagation();
      handleButtonRelease(btn.key, this);
    }, { passive: false });
  });
}

// Auto Button Handler
function setupAutoButton() {
  elements.autoButton.addEventListener('click', function() {
    autoMode = !autoMode;
    
    // Reset all button states when switching modes
    Object.keys(buttonStates).forEach(key => {
      if (key !== 'pump') {
        buttonStates[key] = false;
      }
    });
    
    if (autoMode) {
      this.textContent = 'AUTO ON';
      this.className = 'control-button auto-btn auto-on';
      sendCommand(COMMANDS.AUTO_ON);
      
      // Disable and change appearance of all directional buttons
      document.querySelectorAll('.direction-btn').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.classList.remove('active');
      });
      
      // Disable pump button also
      elements.pumpButton.disabled = true;
      elements.pumpButton.style.opacity = '0.5';
      elements.pumpButton.style.cursor = 'not-allowed';
      elements.pumpButton.classList.remove('active');
      
    } else {
      this.textContent = 'AUTO OFF';
      this.className = 'control-button auto-btn auto-off';
      sendCommand(COMMANDS.AUTO_OFF);
      
      // Re-enable all directional buttons
      document.querySelectorAll('.direction-btn').forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      });
      
      // Re-enable pump button
      elements.pumpButton.disabled = false;
      elements.pumpButton.style.opacity = '1';
      elements.pumpButton.style.cursor = 'pointer';
    }
  });
}

// Pump Button Handler - Improved Version
function setupPumpButton() {
  // Prevent default behaviors
  elements.pumpButton.addEventListener('dragstart', e => e.preventDefault());
  elements.pumpButton.addEventListener('selectstart', e => e.preventDefault());
  elements.pumpButton.addEventListener('contextmenu', e => e.preventDefault());
  
  // Mouse Events
  elements.pumpButton.addEventListener('mousedown', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!autoMode) {
      handleButtonPress('pump', COMMANDS.PUMP_ON, this);
      pumpActive = true;
    }
  });

  elements.pumpButton.addEventListener('mouseup', function(e) {
    e.preventDefault();
    e.stopPropagation();
    handleButtonRelease('pump', this);
  });

  elements.pumpButton.addEventListener('mouseleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    handleButtonRelease('pump', this);
  });

  // Touch Events
  elements.pumpButton.addEventListener('touchstart', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!autoMode) {
      handleButtonPress('pump', COMMANDS.PUMP_ON, this);
      pumpActive = true;
    }
  }, { passive: false });

  elements.pumpButton.addEventListener('touchend', function(e) {
    e.preventDefault();
    e.stopPropagation();
    handleButtonRelease('pump', this);
  }, { passive: false });

  elements.pumpButton.addEventListener('touchcancel', function(e) {
    e.preventDefault();
    e.stopPropagation();
    handleButtonRelease('pump', this);
  }, { passive: false });
}

// Monitoring Function
function openMonitoring() {
  const monitoringWindow = window.open('../monitoring/index.html', '_blank');

  if (!monitoringWindow || monitoringWindow.closed || typeof monitoringWindow.closed === 'undefined') {
    if (confirm('Monitoring akan membuka di tab ini. Apakah Anda yakin ingin melanjutkan?')) {
      window.location.href = '../monitoring/index.html';
    }
  }
}

// Stop all movements function
function stopAllMovements() {
  Object.keys(buttonStates).forEach(key => {
    if (buttonStates[key] && key !== 'pump') {
      buttonStates[key] = false;
      const element = elements[key + 'Btn'];
      if (element) {
        element.classList.remove('active');
      }
    }
  });
  
  if (!autoMode && isConnected) {
    sendCommand(COMMANDS.STOP);
  }
}

// Initialize Application
function init() {
  console.log('Initializing Robot Control Application...');
  
  // Setup event handlers
  setupDirectionButtons();
  setupAutoButton();
  setupPumpButton();
  
  // Initialize MQTT connection
  initMQTT();
  
  // Initial status
  updateConnectionStatus(false, 'Menghubungkan...');
  
  console.log('Application initialized successfully');
}

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    // Page is hidden, stop all movements
    stopAllMovements();
  }
});

// Handle page unload
window.addEventListener('beforeunload', function() {
  stopAllMovements();
  if (mqttClient) {
    mqttClient.end();
  }
});

// Handle focus lost
window.addEventListener('blur', function() {
  stopAllMovements();
});

// Start application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);