"""
AURA-MF Dashboard Backend - Flask Application
==============================================
"""

import os
import time
import random
from datetime import datetime
from flask import Flask, jsonify, request, render_template_string
from flask_cors import CORS
from flask_mail import Mail, Message

app = Flask(__name__)
CORS(app)

# 1. Configuration Setup
CONTACT_RECIPIENT = os.environ.get("CONTACT_EMAIL")

app.config.update(
    MAIL_SERVER='smtp.gmail.com',
    MAIL_PORT=587,
    MAIL_USE_TLS=True,
    MAIL_USERNAME=os.environ.get("MAIL_USERNAME"),
    MAIL_PASSWORD=os.environ.get("MAIL_PASSWORD"),
    MAIL_DEFAULT_SENDER=os.environ.get("MAIL_USERNAME")
)

mail = Mail(app)

# ============================================================================
# SIMULATION PARAMETERS
# ============================================================================

class SimulationState:
    """Maintains persistent simulation state across requests"""
    def __init__(self):
        self.time = 0
        self.fidelity_history = []
        self.temperature_base = 45.0
        self.last_update = time.time()
        
    def update(self):
        current_time = time.time()
        dt = current_time - self.last_update
        self.time += dt
        self.last_update = current_time
        
        # Fidelity switching logic
        if self.time % 10 < 3:
            new_fidelity = 2
        elif self.time % 10 < 7:
            new_fidelity = 1
        else:
            new_fidelity = 0
            
        self.fidelity_history.append(new_fidelity)
        if len(self.fidelity_history) > 100:
            self.fidelity_history = self.fidelity_history[-100:]
        
        return new_fidelity

# Initialize global state
sim_state = SimulationState()

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def generate_temperature_field(grid_size=10, base_temp=45.0, fidelity=1):
    temp_field = []
    hotspot_intensity = [5.0, 3.0, 1.0][fidelity]
    noise_level = [2.0, 1.0, 0.5][fidelity]
    
    for i in range(grid_size):
        row = []
        for j in range(grid_size):
            center_x, center_y = grid_size / 2, grid_size / 2
            dist_from_center = ((i - center_x)**2 + (j - center_y)**2)**0.5
            radial_temp = base_temp + hotspot_intensity * (1 - dist_from_center / (grid_size/2))
            noise = random.uniform(-noise_level, noise_level)
            time_variation = 2.0 * abs(0.5 - (sim_state.time % 20) / 20)
            row.append(round(radial_temp + noise + time_variation, 2))
        temp_field.append(row)
    return temp_field

def calculate_energy_residuals(fidelity, temperature_field):
    temps = [t for row in temperature_field for t in row]
    avg_temp = sum(temps) / len(temps)
    std_temp = (sum((t - avg_temp)**2 for t in temps) / len(temps))**0.5
    base_residual = [1e-2, 1e-3, 1e-5][fidelity]
    return round(base_residual * (1 + std_temp / 100), 8)

def calculate_ml_confidence(fidelity_history):
    if len(fidelity_history) < 5: return 0.85
    recent = fidelity_history[-10:]
    switches = sum(1 for i in range(len(recent)-1) if recent[i] != recent[i+1])
    confidence = 0.95 - (switches * 0.02) + random.uniform(-0.02, 0.02)
    return round(max(0.80, min(0.99, confidence)), 3)

def validate_contact_data(data):
    if not data: return False, "No data provided"
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    message = data.get('message', '').strip()
    if not name or not email or '@' not in email or len(message) < 10:
        return False, "Invalid input fields"
    return True, None

# ============================================================================
# ROUTES
# ============================================================================

@app.route('/')
def index():
    html = """
    <!DOCTYPE html>
    <html>
    <head><title>AURA-MF Dashboard API</title></head>
    <body style="font-family: sans-serif; background: #2d3436; color: white; padding: 40px;">
        <h1>🌞 AURA-MF API Online</h1>
        <p>Simulation Time: {{ sim_time }}s</p>
        <p>Email Status: {{ mail_status }}</p>
    </body>
    </html>
    """
    mail_status = "Configured" if app.config['MAIL_PASSWORD'] else "Missing Password"
    return render_template_string(html, mail_status=mail_status, sim_time=round(sim_state.time, 1))

@app.route('/api/health')
def health_check():
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }), 200

@app.route('/api/simulate', methods=['GET'])
def simulate():
    current_fidelity = sim_state.update()
    temp_field = generate_temperature_field(10, sim_state.temperature_base, current_fidelity)
    return jsonify({
        "temperature_field": temp_field,
        "fidelity_level": current_fidelity,
        "energy_residuals": calculate_energy_residuals(current_fidelity, temp_field),
        "ml_confidence": calculate_ml_confidence(sim_state.fidelity_history),
        "timestamp": round(sim_state.time, 2)
    }), 200

@app.route('/api/contact', methods=['POST', 'OPTIONS'])
def contact():
    if request.method == 'OPTIONS': return '', 204
    
    data = request.get_json()
    if data.get('website_hp'):
        return jsonify({"status": "success", "message": "Message received"}), 200

    is_valid, error_msg = validate_contact_data(data)
    if not is_valid:
        return jsonify({"status": "error", "message": error_msg}), 400

    try:
        msg = Message(
            subject=f"AURA-MF Contact: {data['name']}",
            recipients=[CONTACT_RECIPIENT],
            body=f"From: {data['name']} ({data['email']})\n\n{data['message']}"
        )
        mail.send(msg)
        return jsonify({"status": "success", "message": "Email sent!"}), 200
    except Exception as e:
        app.logger.error(f"Mail error: {e}")
        return jsonify({"status": "error", "message": "Mail server error"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
