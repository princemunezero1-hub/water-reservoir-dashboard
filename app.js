
// ======================================================
// WATER RESERVOIR DASHBOARD
// ESP32 + EMQX MQTT + EMQX TABLES
// ======================================================

// 1. EMQX MQTT CONFIGURATION

const MQTT_URL =
  "wss://l6f00bab.ala.us-east-1.emqxsl.com:8084/mqtt";

const MQTT_TOPIC = "waterreservoir/esp32/status";

let mqttClient = null;
let historyChart = null;

// 2. HTML ELEMENTS

const connectionStatus =
  document.getElementById("connectionStatus");

const waterLevelElement =
  document.getElementById("waterLevel");

const pumpStatusElement =
  document.getElementById("pumpStatus");

const pumpModeElement =
  document.getElementById("pumpMode");

const sensorValueElement =
  document.getElementById("sensorValue");

const mqttMessageElement =
  document.getElementById("mqttMessage");

const historyMessageElement =
  document.getElementById("historyMessage");

const historyTable =
  document.getElementById("historyTable");

// 3. UPDATE CONNECTION INDICATOR

function setConnectionStatus(connected) {

  if (connected) {
    connectionStatus.textContent = "CONNECTED";
    connectionStatus.className = "status online";
  } else {
    connectionStatus.textContent = "DISCONNECTED";
    connectionStatus.className = "status offline";
  }
}

// 4. DISPLAY LIVE ESP32 DATA

function updateDashboard(data) {

  const level = Number(data.waterLevel);
  const sensor = Number(data.sensorValue);

  if (
    !Number.isFinite(level) ||
    !Number.isFinite(sensor) ||
    level < 0 || level > 100
  ) {
    console.warn("Invalid sensor message:", data);
    return;
  }

  waterLevelElement.textContent = level + "%";

  sensorValueElement.textContent = sensor;

  pumpStatusElement.textContent =
    data.pumpStatus || "--";

  pumpModeElement.textContent =
    data.pumpAutomatic === true ? "AUTOMATIC" :
    data.pumpAutomatic === false ? "MANUAL" : "--";

  // Update gauge appearance
  const gauge = document.querySelector(".gauge");

  if (gauge) {
    gauge.style.borderColor =
      level <= 20 ? "#f59e0b" :
      level >= 80 ? "#16a34a" : "#2563eb";
  }

  // Pump status appearance
  pumpStatusElement.style.color =
    data.pumpStatus === "ON" ? "#16a34a" : "#dc2626";

  console.log("Live ESP32 data:", data);
}

// 5. CONNECT TO EMQX USING MQTT OVER WEBSOCKET

function connectMQTT() {

  const username =
    document.getElementById("mqttUsername").value.trim();

  const password =
    document.getElementById("mqttPassword").value;

  if (!username || !password) {
    mqttMessageElement.textContent =
      "Enter your temporary MQTT test username and password.";
    return;
  }

  if (mqttClient) {
    mqttClient.end(true);
    mqttClient = null;
  }

  const clientId =
    "water_dashboard_" +
    Math.random().toString(16).substring(2, 12);

  mqttMessageElement.textContent =
    "Connecting to EMQX...";

  setConnectionStatus(false);

  mqttClient = mqtt.connect(MQTT_URL, {

    clientId: clientId,
    username: username,
    password: password,

    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 3000,

    keepalive: 60

  });

  mqttClient.on("connect", function () {

    setConnectionStatus(true);

    mqttMessageElement.textContent =
      "Connected! Subscribing to ESP32 topic...";

    mqttClient.subscribe(MQTT_TOPIC, function (error) {

      if (error) {
        mqttMessageElement.textContent =
          "Subscription failed: " + error.message;
        return;
      }

      mqttMessageElement.textContent =
        "Connected and subscribed to " + MQTT_TOPIC;
    });
  });

  mqttClient.on("message", function (topic, message) {

    try {

      const data = JSON.parse(message.toString());

      updateDashboard(data);

      mqttMessageElement.textContent =
        "Last live update: " + new Date().toLocaleTimeString();

    } catch (error) {

      console.error("Invalid MQTT JSON:", error);

      mqttMessageElement.textContent =
        "Received a message, but its JSON format is invalid.";
    }
  });

  mqttClient.on("reconnect", function () {

    setConnectionStatus(false);

    mqttMessageElement.textContent =
      "Reconnecting to EMQX...";
  });

  mqttClient.on("offline", function () {

    setConnectionStatus(false);
  });

  mqttClient.on("error", function (error) {

    console.error("MQTT error:", error);

    mqttMessageElement.textContent =
      "MQTT error: " + error.message;
  });

  mqttClient.on("close", function () {

    setConnectionStatus(false);
  });
}

// 6. DISCONNECT MQTT

function disconnectMQTT() {

  if (mqttClient) {

    mqttClient.end(true);

    mqttClient = null;
  }

  setConnectionStatus(false);

  mqttMessageElement.textContent =
    "Disconnected from EMQX.";
}

// 7. EMQX TABLES CONFIGURATION

const TABLES_URL =
  "https://z106f496.aka.aws.cloud.emqxtables.com/v1/sql";

// 8. LOAD HISTORICAL DATA

async function loadHistory() {

  const username =
    document.getElementById("tablesUsername").value.trim();

  const password =
    document.getElementById("tablesPassword").value;

  if (!username || !password) {

    historyMessageElement.textContent =
      "Enter temporary read-only Tables credentials.";

    return;
  }

  historyMessageElement.textContent =
    "Loading historical readings...";

  const sql = `
    SELECT
      timestamp,
      waterLevel,
      sensorValue,
      pumpStatus,
      pumpAutomatic
    FROM water_reservoir
    ORDER BY timestamp DESC
    LIMIT 50
  `;

  try {

    const authorization =
      "Basic " + btoa(username + ":" + password);

    const response = await fetch(TABLES_URL, {

      method: "POST",

      headers: {
        "Authorization": authorization,
        "Content-Type": "application/x-www-form-urlencoded"
      },

      body: new URLSearchParams({
        sql: sql
      })

    });

    if (!response.ok) {

      throw new Error(
        "Tables API returned HTTP " + response.status
      );
    }

    const result = await response.json();

    const records =
      result.output?.find(item => item.records)?.records;

    if (!records) {

      throw new Error(
        "No records returned. Check the SQL query and database."
      );
    }

    const columns =
      records.schema.column_schemas.map(column => column.name);

    const rows = records.rows || [];

    const data = rows.map(row => {

      const item = {};

      columns.forEach((column, index) => {
        item[column] = row[index];
      });

      return item;
    });

    displayHistory(data);

    historyMessageElement.textContent =
      "Successfully loaded " + data.length +
      " historical records from EMQX Tables.";

  } catch (error) {

    console.error("Historical data error:", error);

    historyMessageElement.textContent =
      "Could not load history: " + error.message +
      ". Check credentials, permissions and browser CORS access.";
  }
}

// 9. DISPLAY HISTORY TABLE AND CHART

function displayHistory(data) {

  // API returns newest first.
  // Reverse it for chronological chart display.

  const chronologicalData = [...data].reverse();

  if (data.length === 0) {

    historyTable.innerHTML =
      '<tr><td colspan="4">No records found.</td></tr>';

    return;
  }

  // Populate history table

  historyTable.innerHTML = data.map(item => {

    const date = item.timestamp
      ? new Date(item.timestamp).toLocaleString()
      : "--";

    return `
      <tr>
        <td>${date}</td>
        <td>${item.waterLevel ?? "--"}%</td>
        <td>${item.sensorValue ?? "--"}</td>
        <td>${item.pumpStatus ?? "--"}</td>
      </tr>
    `;

  }).join("");

  // Prepare chart

  const labels = chronologicalData.map(item => {

    return item.timestamp
      ? new Date(item.timestamp).toLocaleTimeString()
      : "--";
  });

  const levels = chronologicalData.map(item =>
    Number(item.waterLevel)
  );

  const canvas =
    document.getElementById("historyChart");

  if (historyChart) {
    historyChart.destroy();
  }

  historyChart = new Chart(canvas, {

    type: "line",

    data: {

      labels: labels,

      datasets: [{

        label: "Water Level (%)",

        data: levels,

        borderWidth: 2,

        tension: 0.3,

        fill: true
      }]
    },

    options: {

      responsive: true,

      maintainAspectRatio: true,

      scales: {

        y: {
          min: 0,
          max: 100,
          title: {
            display: true,
            text: "Water Level (%)"
          }
        },

        x: {
          title: {
            display: true,
            text: "Time"
          }
        }
      }
    }
  });
}

// 10. BUTTON EVENTS

document
  .getElementById("connectMqtt")
  .addEventListener("click", connectMQTT);

document
  .getElementById("disconnectMqtt")
  .addEventListener("click", disconnectMQTT);

document
  .getElementById("loadHistory")
  .addEventListener("click", loadHistory);

// 11. INITIAL DASHBOARD STATE

setConnectionStatus(false);

console.log("Water Reservoir Dashboard initialized.");
