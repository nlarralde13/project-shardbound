from flask import Flask, render_template
import json

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/index2')
def test_index():
    return render_template('index2.html')

if __name__ == '__main__':
    app.run(debug=True)
