"""Cross-cutting infrastructure: settings, logging, database, error handling.

Per BE-001, nothing in app.core or app.modules.*.models may import FastAPI
request/response types — this package is framework-agnostic aside from
app.core.errors, which necessarily depends on FastAPI/Starlette exception
types because translating them is its entire job.
"""
