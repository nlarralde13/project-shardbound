from flask import Flask, render_template
import json

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/index2')
def test_index():
    return render_template('index2.html')

@app.route('/rng-test')
def rng_test():
    # Leaving as-is to avoid disturbing your current setup.
    # Note: This expects a template at /static/src/dev/rng-test.html which is unusual for render_template.
    return render_template('/static/src/dev/rng-test.html')

# NEW: MVP1 sandbox route (uses templates/mvp1.html)
@app.route('/mvp1')
def mvp1():
    return render_template('mvp1.html')

if __name__ == '__main__':
    app.run(debug=True)
