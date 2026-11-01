/* API layer: one function per FastAPI route in main.py */
const Api = (() => {
  // Change this (or set window.ROLLBOOK_API_URL before this script) if the backend runs elsewhere
  const BASE = window.ROLLBOOK_API_URL ||
    (location.hostname.endsWith("onrender.com")
      ? "https://fastapi-and-postgres-fqmd.onrender.com"
      : "http://127.0.0.1:8000");

  class ApiError extends Error {
    constructor(message, status, fields) {
      super(message);
      this.status = status;
      this.fields = fields || null; // { fieldName: message } from Pydantic 422 errors
    }
  }

  function parseError(body, status) {
    const detail = body && body.detail;
    if (typeof detail === "string") return new ApiError(detail, status);
    if (Array.isArray(detail)) {
      const fields = {};
      detail.forEach((e) => {
        const key = e.loc[e.loc.length - 1];
        if (!fields[key]) fields[key] = e.msg.replace(/^Value error, /, "");
      });
      return new ApiError("Some fields need attention.", status, fields);
    }
    return new ApiError(`Request failed (${status}).`, status);
  }

  async function request(path, options = {}) {
    let res;
    try {
      res = await fetch(BASE + path, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
    } catch (err) {
      if (err.name === "AbortError") throw err;
      throw new ApiError("Can't reach the API. Check that the server is running on " + BASE + ".", 0);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw parseError(body, res.status);
    return body;
  }

  const enc = encodeURIComponent;

  return {
    // GET /students?course=&sort_by=&order=&page=&limit=
    list(params, signal) {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") q.set(k, v);
      });
      return request(`/students?${q}`, { signal });
    },
    get: (id) => request(`/student/${enc(id)}`),
    create: (student) => request("/CreateStudent", { method: "POST", body: JSON.stringify(student) }),
    update: (id, changes) => request(`/UpdateStudent/${enc(id)}`, { method: "PUT", body: JSON.stringify(changes) }),
    remove: (id) => request(`/DeleteStudent/${enc(id)}`, { method: "DELETE" }),
  };
})();