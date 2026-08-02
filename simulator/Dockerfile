FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source into a 'simulator' package so `python -m simulator.main` works
COPY . ./simulator/

CMD ["python", "-m", "simulator.main"]
