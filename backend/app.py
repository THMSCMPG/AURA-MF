"""
AURA-MF Dashboard Backend - Flask Application
==============================================

Hosted on: Alwaysdata
Purpose: Serve real-time PV simulation data and handle contact form submissions
Routes:
  - GET  /api/simulate : Returns mock temperature fields, fidelity levels, energy balance
  - POST /api/contact  : Processes contact form submissions with anti-spam
  - GET  /api/health   : Health check endpoint

Author: AURA-MF Development Team
Version: 1.0.0
"""

import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_mail import Mail, Message

app = Flask(__name__)

# Fixed CORS: No trailing slash on origins
CORS(app, resources={r"/api/*": {"origins": ["https://thmscmpg.github.io/AURA-MF", "http://localhost:4000"]}})

# Updated Gmail SMTP Configuration
app.config.update(
    MAIL_SERVER='smtp.gmail.com',
    MAIL_PORT=587,
    MAIL_USE_TLS=True,
    MAIL_USERNAME=os.environ.get("MAIL_USERNAME"),
    MAIL_PASSWORD=os.environ.get("MAIL_PASSWORD"),
    MAIL_DEFAULT_SENDER=os.environ.get("MAIL_USERNAME")
)

mail = Mail(app)

@app.route('/api/contact', methods=['POST'])
def contact():
    data = request.json
    # Honeypot check
    if data.get('website_hp'):
        return jsonify({"status": "error", "message": "Bot detected"}), 400
        
    msg = Message(f"New AURA-MF Message from {data['name']}",
                  recipients=[os.environ.get("CONTACT_EMAIL")])
    msg.body = f"From: {data['name']} ({data['email']})\n\n{data['message']}"
    mail.send(msg)
    return jsonify({"status": "success", "message": "Thank you! Message sent."})

if __name__ == "__main__":
    # Render binds to the PORT environment variable
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))


mail = Mail(app)

# ============================================================================
# SIMULATION PARAMETERS
# ============================================================================

class SimulationState:
    """Maintains persistent simulation state across requests"""
    def __init__(self):
        self.time = 0
        self.fidelity_history = []
        self.temperature_base = 45.0  # Base temperature in Celsius
        self.last_update = time.time()
        
    def update(self):
        """Update simulation state with realistic physics"""
        current_time = time.time()
        dt = current_time - self.last_update
        self.time += dt
        self.last_update = current_time
        
        # Fidelity switching logic (ML-orchestrated)
        # Transition probabilities based on current state
        current_fidelity = self.fidelity_history[-1] if self.fidelity_history else 1
        
        # Simulate intelligent fidelity selection
        if self.time % 10 < 3:  # Transient phase (use HF)
            new_fidelity = 2
        elif self.time % 10 < 7:  # Moderate changes (use MF)
            new_fidelity = 1
        else:  # Steady state (use LF)
            new_fidelity = 0
            
        self.fidelity_history.append(new_fidelity)
        if len(self.fidelity_history) > 100:
            self.fidelity_history = self.fidelity_history[-100:]
        
        return new_fidelity

# Global simulation state
sim_state = SimulationState()

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def generate_temperature_field(grid_size=10, base_temp=45.0, fidelity=1):
    """
    Generate realistic 2D temperature field for PV panel
    
    Args:
        grid_size: NxN grid resolution
        base_temp: Base temperature in Celsius
        fidelity: 0 (LF), 1 (MF), 2 (HF)
    
    Returns:
        2D array of temperatures
    """
    temp_field = []
    
    # Temperature variation parameters (realistic PV thermal distribution)
    hotspot_intensity = [5.0, 3.0, 1.0][fidelity]  # Less variation in LF
    noise_level = [2.0, 1.0, 0.5][fidelity]        # More noise in LF
    
    for i in range(grid_size):
        row = []
        for j in range(grid_size):
            # Center hotspot (solar concentration)
            center_x, center_y = grid_size / 2, grid_size / 2
            dist_from_center = ((i - center_x)**2 + (j - center_y)**2)**0.5
            
            # Temperature profile: hottest in center, cooler at edges
            radial_temp = base_temp + hotspot_intensity * (1 - dist_from_center / (grid_size/2))
            
            # Add realistic noise
            noise = random.uniform(-noise_level, noise_level)
            
            # Time-varying component (sinusoidal for solar variation)
            time_variation = 2.0 * abs(0.5 - (sim_state.time % 20) / 20)
            
            final_temp = radial_temp + noise + time_variation
            row.append(round(final_temp, 2))
        
        temp_field.append(row)
    
    return temp_field


def calculate_energy_residuals(fidelity, temperature_field):
    """
    Calculate energy balance residuals
    
    Lower residuals = better energy conservation
    HF has lowest residuals, LF has highest
    """
    # Flatten temperature field
    temps = [t for row in temperature_field for t in row]
    avg_temp = sum(temps) / len(temps)
    std_temp = (sum((t - avg_temp)**2 for t in temps) / len(temps))**0.5
    
    # Residual magnitude depends on fidelity
    base_residual = [1e-2, 1e-3, 1e-5][fidelity]
    
    # Add some temperature-dependent variation
    residual = base_residual * (1 + std_temp / 100)
    
    return round(residual, 8)


def calculate_ml_confidence(fidelity_history):
    """
    Calculate ML orchestrator confidence
    
    Based on consistency of fidelity selections
    """
    if len(fidelity_history) < 5:
        return 0.85
    
    # Recent fidelity switches
    recent = fidelity_history[-10:]
    
    # Confidence decreases with excessive switching (chatter)
    switches = sum(1 for i in range(len(recent)-1) if recent[i] != recent[i+1])
    
    # Base confidence
    confidence = 0.95 - (switches * 0.02)
    
    # Add some random variation
    confidence += random.uniform(-0.02, 0.02)
    
    return round(max(0.80, min(0.99, confidence)), 3)


def validate_contact_data(data):
    """
    Validate contact form data
    
    Returns: (is_valid, error_message)
    """
    if not data:
        return False, "No data provided"
    
    # Required fields
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    message = data.get('message', '').strip()
    
    if not name or len(name) < 2:
        return False, "Name must be at least 2 characters"
    
    if not email or '@' not in email:
        return False, "Valid email required"
    
    if not message or len(message) < 10:
        return False, "Message must be at least 10 characters"
    
    # Length limits (prevent abuse)
    if len(name) > 100:
        return False, "Name too long"
    
    if len(email) > 150:
        return False, "Email too long"
    
    if len(message) > 5000:
        return False, "Message too long"
    
    return True, None


# ============================================================================
# ROUTES
# ============================================================================

@app.route('/')
def index():
    """Root endpoint - API documentation"""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>AURA-MF Dashboard API</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                   max-width: 800px; margin: 50px auto; padding: 20px;
                   background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                   color: white; }
            .card { background: rgba(255,255,255,0.1); padding: 20px; 
                    border-radius: 10px; margin: 20px 0; backdrop-filter: blur(10px); }
            h1 { font-size: 2.5em; margin-bottom: 10px; }
            code { background: rgba(0,0,0,0.3); padding: 3px 8px; border-radius: 4px; }
            .endpoint { margin: 15px 0; padding: 15px; background: rgba(255,255,255,0.05); 
                        border-left: 4px solid #4CAF50; border-radius: 5px; }
            .method { color: #4CAF50; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>🌞 AURA-MF Dashboard API</h1>
        <p>Multi-Fidelity Photovoltaic Simulation Backend</p>
        
        <div class="card">
            <h2>📡 Available Endpoints</h2>
            
            <div class="endpoint">
                <p><span class="method">GET</span> <code>/api/simulate</code></p>
                <p>Returns real-time PV simulation data including:</p>
                <ul>
                    <li>10×10 temperature field T(x,y,t)</li>
                    <li>Fidelity level (0=LF, 1=MF, 2=HF)</li>
                    <li>Energy balance residuals</li>
                    <li>ML orchestrator confidence</li>
                </ul>
            </div>
            
            <div class="endpoint">
                <p><span class="method">POST</span> <code>/api/contact</code></p>
                <p>Contact form submission endpoint</p>
                <p>Accepts JSON: <code>{"name": "...", "email": "...", "message": "..."}</code></p>
            </div>
            
            <div class="endpoint">
                <p><span class="method">GET</span> <code>/api/health</code></p>
                <p>Health check endpoint</p>
            </div>
        </div>
        
        <div class="card">
            <h2>📊 Current Status</h2>
            <p>✅ API Online</p>
            <p>🔒 CORS Enabled for: <code>thmscmpg.github.io</code></p>
            <p>📧 Email Service: {{ mail_status }}</p>
            <p>⏱️ Simulation Time: {{ sim_time }}s</p>
        </div>
        
        <div class="card">
            <p style="text-align: center; opacity: 0.8;">
                AURA-MF v1.0.0 | Powered by Flask + Alwaysdata
            </p>
        </div>
    </body>
    </html>
    """
    
    mail_status = "Configured" if MAIL_PASSWORD != "your_email_password" else "Not Configured"
    
    return render_template_string(html, 
                                   mail_status=mail_status,
                                   sim_time=round(sim_state.time, 1))


@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint
    
    Returns: System status
    """
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "simulation_time": round(sim_state.time, 2),
        "fidelity_switches": len(sim_state.fidelity_history),
        "version": "1.0.0"
    }), 200


@app.route('/api/simulate', methods=['GET'])
def simulate():
    """
    Simulation data endpoint
    
    Returns:
        JSON object containing:
        - temperature_field: 10×10 2D array of temperatures
        - fidelity_level: 0 (LF), 1 (MF), or 2 (HF)
        - energy_residuals: Energy conservation error
        - ml_confidence: ML orchestrator confidence (0-1)
        - timestamp: Current simulation time
        - metadata: Additional simulation info
    """
    # Update simulation state
    current_fidelity = sim_state.update()
    
    # Generate temperature field based on current fidelity
    temp_field = generate_temperature_field(
        grid_size=10,
        base_temp=sim_state.temperature_base,
        fidelity=current_fidelity
    )
    
    # Calculate energy residuals
    residuals = calculate_energy_residuals(current_fidelity, temp_field)
    
    # Calculate ML confidence
    confidence = calculate_ml_confidence(sim_state.fidelity_history)
    
    # Prepare response
    response_data = {
        "temperature_field": temp_field,
        "fidelity_level": current_fidelity,
        "fidelity_name": ["Low (LF)", "Medium (MF)", "High (HF)"][current_fidelity],
        "energy_residuals": residuals,
        "ml_confidence": confidence,
        "timestamp": round(sim_state.time, 2),
        "metadata": {
            "grid_size": "10×10",
            "base_temperature": sim_state.temperature_base,
            "min_temp": round(min(min(row) for row in temp_field), 2),
            "max_temp": round(max(max(row) for row in temp_field), 2),
            "avg_temp": round(sum(sum(row) for row in temp_field) / 100, 2),
            "total_fidelity_switches": len(sim_state.fidelity_history)
        }
    }
    
    return jsonify(response_data), 200


@app.route('/api/contact', methods=['POST', 'OPTIONS'])
def contact():
    """
    Contact form submission endpoint
    
    Accepts:
        JSON with fields: name, email, message, website_hp (honeypot)
    
    Returns:
        JSON status response
    """
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        return '', 204
    
    # Get JSON data
    try:
        data = request.get_json()
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": "Invalid JSON data"
        }), 400
    
    # ANTI-SPAM: Honeypot check
    # If the hidden field 'website_hp' is filled, it's a bot
    if data.get('website_hp'):
        # Log but pretend success (don't let bot know)
        app.logger.info(f"Honeypot triggered: {data.get('email', 'unknown')}")
        return jsonify({
            "status": "success",
            "message": "Message received"
        }), 200
    
    # Validate contact data
    is_valid, error_msg = validate_contact_data(data)
    if not is_valid:
        return jsonify({
            "status": "error",
            "message": error_msg
        }), 400
    
    # Extract validated data
    name = data.get('name').strip()
    email = data.get('email').strip()
    message = data.get('message').strip()
    
    # Log the contact attempt
    timestamp = datetime.utcnow().isoformat()
    app.logger.info(f"Contact form submission: {name} ({email}) at {timestamp}")
    
    # Send email
    try:
        msg = Message(
            subject=f"AURA-MF Contact: {name}",
            sender=app.config['MAIL_USERNAME'],
            recipients=[CONTACT_RECIPIENT],
            body=f"""
New contact form submission from AURA-MF Dashboard

From: {name}
Email: {email}
Time: {timestamp}

Message:
{message}

---
Sent via AURA-MF Dashboard Contact Form
            """.strip()
        )
        
        mail.send(msg)
        
        app.logger.info(f"Email sent successfully to {CONTACT_RECIPIENT}")
        
        return jsonify({
            "status": "success",
            "message": "Thank you! Your message has been sent successfully."
        }), 200
        
    except Exception as e:
        # Log the error but don't expose details to client
        app.logger.error(f"Email send failed: {str(e)}")
        
        # Fallback: At least log the message to server logs
        app.logger.info(f"CONTACT (email failed): {name} ({email}): {message}")
        
        return jsonify({
            "status": "error",
            "message": "Unable to send message. Please try again later or email directly."
        }), 500


@app.errorhandler(404)
def not_found(error):
    """404 Error handler"""
    return jsonify({
        "status": "error",
        "message": "Endpoint not found",
        "available_endpoints": ["/api/simulate", "/api/contact", "/api/health"]
    }), 404


@app.errorhandler(500)
def internal_error(error):
    """500 Error handler"""
    app.logger.error(f"Internal error: {str(error)}")
    return jsonify({
        "status": "error",
        "message": "Internal server error"
    }), 500


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    # Development server (use Alwaysdata's WSGI in production)
    app.run(debug=True, host='0.0.0.0', port=5000)
