function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesLabel(text, labels) {
  const n = normalize(text);
  return labels.some((label) => {
    const t = normalize(label);
    return n === t || n.includes(t) || t.includes(n);
  });
}

function isVisible(el) {
  if (!el || el.disabled) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function setNativeValue(el, value) {
  if (!el || value == null || value === "") return false;
  const str = String(value);

  if (el.isContentEditable) {
    el.focus();
    el.innerText = str;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  if (el.tagName === "SELECT") {
    const options = [...el.options];
    const match = options.find(
      (o) =>
        normalize(o.text).includes(normalize(str)) ||
        normalize(o.value).includes(normalize(str)) ||
        normalize(str).includes(normalize(o.text))
    );
    if (match) {
      el.value = match.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  if (el.value && el.value.trim().length > 3) return false;

  el.focus();
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, str);
  else el.value = str;

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

function getEntry(entries, key) {
  return entries.find((e) => e.key === key);
}

function fillBySelectors(entries) {
  let filled = 0;
  const map = [
    ['input[type="email"], input[autocomplete="email"]', "email"],
    ['input[type="tel"], input[autocomplete="tel"]', "phone"],
    ['input[name*="email" i], input[id*="email" i]', "email"],
    ['input[name*="phone" i], input[id*="phone" i], input[name*="mobile" i]', "phone"],
    ['input[name*="first" i], input[id*="first" i], input[autocomplete="given-name"]', "firstName"],
    ['input[name*="last" i], input[id*="last" i], input[autocomplete="family-name"]', "lastName"],
    ['input[name*="full" i][name*="name" i], input[name="name"]', "fullName"],
    ['input[name*="gpa" i], input[id*="gpa" i]', "gpa"],
    ['input[name*="major" i], input[id*="major" i], select[name*="major" i]', "intendedMajor"],
    ['input[name*="school" i], input[id*="school" i], select[name*="school" i]', "highSchool"],
    ['input[name*="city" i], input[autocomplete="address-level2"]', "city"],
    ['input[name*="state" i], select[name*="state" i], input[autocomplete="address-level1"]', "state"],
    ['input[name*="zip" i], input[name*="postal" i], input[autocomplete="postal-code"]', "zip"],
    ['input[name*="address" i]:not([name*="email" i]), input[autocomplete="street-address"]', "street"],
    ['textarea[name*="goal" i], textarea[name*="career" i]', "careerGoals"],
  ];

  for (const [selector, key] of map) {
    const entry = getEntry(entries, key);
    if (!entry?.value) continue;
    document.querySelectorAll(selector).forEach((el) => {
      if (isVisible(el) && setNativeValue(el, entry.value)) filled++;
    });
  }
  return filled;
}

function fillByAriaAndPlaceholders(entries) {
  let filled = 0;
  document.querySelectorAll("input, textarea, select").forEach((el) => {
    if (!isVisible(el)) return;
    const hints = [
      el.getAttribute("aria-label") || "",
      el.getAttribute("placeholder") || "",
      el.getAttribute("name") || "",
      el.getAttribute("id") || "",
    ].join(" ");

    for (const entry of entries) {
      if (!entry.value) continue;
      if (matchesLabel(hints, entry.labels) && setNativeValue(el, entry.value)) {
        filled++;
      }
    }
  });
  return filled;
}

function fillByLabels(entries) {
  let filled = 0;
  document.querySelectorAll("label").forEach((label) => {
    const text = label.innerText || label.textContent || "";
    for (const entry of entries) {
      if (!entry.value || !matchesLabel(text, entry.labels)) continue;
      const forId = label.getAttribute("for");
      if (forId) {
        const el = document.getElementById(forId);
        if (isVisible(el) && setNativeValue(el, entry.value)) filled++;
      } else {
        label.querySelectorAll("input, textarea, select").forEach((el) => {
          if (isVisible(el) && setNativeValue(el, entry.value)) filled++;
        });
      }
    }
  });
  return filled;
}

function fillBySite(entries) {
  const host = location.hostname.replace(/^www\./, "");
  let filled = 0;

  if (host.includes("bold.org")) {
    filled += fillVisible('[data-testid*="first"], input[name*="first"]', "firstName", entries);
    filled += fillVisible('[data-testid*="last"], input[name*="last"]', "lastName", entries);
  }

  if (host.includes("goingmerry.com")) {
    filled += fillVisible('input[formcontrolname*="first"]', "firstName", entries);
    filled += fillVisible('input[formcontrolname*="last"]', "lastName", entries);
  }

  return filled;
}

function fillVisible(selector, key, entries) {
  const entry = getEntry(entries, key);
  if (!entry?.value) return 0;
  let n = 0;
  document.querySelectorAll(selector).forEach((el) => {
    if (isVisible(el) && setNativeValue(el, entry.value)) n++;
  });
  return n;
}

function findEssayField() {
  const selectors = [
    'textarea[name*="essay" i]',
    'textarea[id*="essay" i]',
    'textarea[placeholder*="essay" i]',
    'textarea[name*="statement" i]',
    'textarea[aria-label*="essay" i]',
    '[contenteditable="true"][role="textbox"]',
    "textarea",
  ];
  for (const sel of selectors) {
    const nodes = [...document.querySelectorAll(sel)].filter(isVisible);
    if (nodes.length) return nodes[0];
  }
  return null;
}

function insertEssay(text) {
  const field = findEssayField();
  if (!field || !text) return false;
  return setNativeValue(field, text);
}

function isLoginPage() {
  const text = document.body.innerText.toLowerCase();
  const hasPassword = document.querySelector(
    'input[type="password"], input[name*="password" i]'
  );
  return (
    hasPassword &&
    /sign in|log in|login|create account|register|join now|password/.test(text)
  );
}

function isApplicationPage() {
  const inputs = document.querySelectorAll(
    'input:not([type="hidden"]), textarea, select'
  );
  let visible = 0;
  inputs.forEach((el) => {
    if (isVisible(el)) visible++;
  });
  return visible >= 2 && !isLoginPage();
}

function autofillProfile(entries) {
  if (isLoginPage()) {
    return { filled: 0, skipped: "login" };
  }

  const filled =
    fillBySite(entries) +
    fillBySelectors(entries) +
    fillByLabels(entries) +
    fillByAriaAndPlaceholders(entries);

  return { filled, skipped: null };
}

function getPageText() {
  return document.body.innerText.slice(0, 8000);
}

function showToast(message, type = "info") {
  let box = document.getElementById("sch-helper-toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "sch-helper-toast";
    document.body.appendChild(box);
  }
  box.className = `sch-helper-toast sch-helper-${type}`;
  box.textContent = message;
  box.style.opacity = "1";
  clearTimeout(box._timer);
  box._timer = setTimeout(() => {
    box.style.opacity = "0";
  }, 4000);
}

// Export for content.js
window.ScholarshipAutofill = {
  autofillProfile,
  insertEssay,
  getPageText,
  isLoginPage,
  isApplicationPage,
  isVisible,
  showToast,
};
