/* Client-side mirror of the Pydantic rules in main.py (StudentCreate / StudentUpdate / grade) */
const Validation = (() => {
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const gradeFor = (m) => (m >= 90 ? "A+" : m >= 80 ? "A" : m >= 70 ? "B" : m >= 60 ? "C" : "F");
  const gradeKey = (g) => ({ "A+": "ap", A: "a", B: "b", C: "c", F: "f" })[g];

  // Python str.title()
  const titleCase = (s) =>
    s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

  const intIn = (raw, min, max) =>
    String(raw).trim() !== "" && Number.isInteger(Number(raw)) && Number(raw) >= min && Number(raw) <= max;

  function validate(v) {
    const errors = {};
    const clean = {};

    clean.id = v.id.trim();
    if (!clean.id) errors.id = "Enter an id, for example S001.";

    clean.name = v.name;
    const letters = v.name.replace(/ /g, "");
    if (v.name.length < 2 || v.name.length > 50) errors.name = "Name must be 2 to 50 characters.";
    else if (!letters || !/^\p{L}+$/u.test(letters)) errors.name = "Use letters and spaces only.";
    else clean.name = titleCase(v.name);

    if (!intIn(v.age, 1, 100)) errors.age = "Enter a whole number from 1 to 100.";
    clean.age = Number(v.age);

    if (!intIn(v.marks, 0, 100)) errors.marks = "Enter a whole number from 0 to 100.";
    clean.marks = Number(v.marks);

    clean.course = v.course.trim();
    if (!clean.course) errors.course = "Enter a course.";
    else if (clean.course.length > 50) errors.course = "Course can be at most 50 characters.";

    clean.email = v.email.trim();
    if (!EMAIL.test(clean.email)) errors.email = "Enter a valid email address.";

    return { errors, clean };
  }

  // Only send fields that changed (the backend applies exclude_unset)
  function diff(original, clean) {
    const out = {};
    ["name", "age", "marks", "course", "email"].forEach((k) => {
      if (clean[k] !== original[k]) out[k] = clean[k];
    });
    return out;
  }

  return { gradeFor, gradeKey, validate, diff };
})();
