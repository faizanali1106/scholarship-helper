/**
 * In-page autofill + submit logic for the Playwright apply worker.
 *
 * `pageFill` is serialized and executed inside the browser page via
 * page.evaluate(). It must be fully self-contained (no outside refs).
 */

export function pageFill({ entries, essay, doSubmit }) {
  const normalize = (t) =>
    String(t || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const isVisible = (el) => {
    if (!el || el.disabled) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const getEntry = (key) => entries.find((e) => e.key === key);

  const labelText = (el) => {
    let text = "";
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) text += " " + lab.textContent;
    }
    const wrapLabel = el.closest("label");
    if (wrapLabel) text += " " + wrapLabel.textContent;
    text += " " + (el.getAttribute("aria-label") || "");
    text += " " + (el.getAttribute("placeholder") || "");
    text += " " + (el.getAttribute("name") || "");
    text += " " + (el.getAttribute("id") || "");
    return normalize(text);
  };

  const setNativeValue = (el, value) => {
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
  };

  // Detect login / auth pages — never submit those.
  const bodyText = normalize(document.body?.innerText || "");
  const hasPassword = !!document.querySelector('input[type="password"]');
  const looksLikeLogin =
    hasPassword &&
    /(sign in|log in|login|create account|sign up|forgot password)/.test(bodyText);

  let filled = 0;

  // 1. Strong selector-based matches.
  const selectorMap = [
    ['input[type="email"], input[autocomplete="email"]', "email"],
    ['input[type="tel"], input[autocomplete="tel"]', "phone"],
    ['input[name*="email" i], input[id*="email" i]', "email"],
    ['input[name*="phone" i], input[id*="phone" i], input[name*="mobile" i]', "phone"],
    ['input[name*="first" i], input[id*="first" i], input[autocomplete="given-name"]', "firstName"],
    ['input[name*="last" i], input[id*="last" i], input[autocomplete="family-name"]', "lastName"],
    ['input[autocomplete="name"], input[name="name" i], input[name*="full" i][name*="name" i]', "fullName"],
    ['input[name*="gpa" i], input[id*="gpa" i]', "gpa"],
    ['input[name*="major" i], input[id*="major" i], select[name*="major" i]', "intendedMajor"],
    ['input[name*="school" i], input[id*="school" i], select[name*="school" i]', "highSchool"],
    ['input[name*="city" i], input[autocomplete="address-level2"]', "city"],
    ['select[name*="state" i], input[name*="state" i], input[autocomplete="address-level1"]', "state"],
    ['input[name*="zip" i], input[name*="postal" i], input[autocomplete="postal-code"]', "zip"],
    ['input[autocomplete="street-address"], input[name*="address" i]:not([name*="email" i])', "street"],
    ['textarea[name*="goal" i], textarea[name*="career" i]', "careerGoals"],
  ];

  for (const [selector, key] of selectorMap) {
    const entry = getEntry(key);
    if (!entry?.value) continue;
    document.querySelectorAll(selector).forEach((el) => {
      if (isVisible(el) && setNativeValue(el, entry.value)) filled++;
    });
  }

  // 2. Label-based matching for anything still empty.
  const fields = [...document.querySelectorAll("input, textarea, select")].filter(
    (el) =>
      isVisible(el) &&
      !["password", "hidden", "file", "submit", "button", "checkbox", "radio"].includes(
        (el.getAttribute("type") || "").toLowerCase()
      )
  );

  for (const el of fields) {
    if (el.value && String(el.value).trim().length > 1) continue;
    const lt = labelText(el);
    if (!lt) continue;
    const entry = entries.find((e) =>
      (e.labels || []).some((lab) => {
        const n = normalize(lab);
        return n && (lt.includes(n) || n.includes(lt));
      })
    );
    if (entry?.value && setNativeValue(el, entry.value)) filled++;
  }

  // 3. Essay / long-answer fields.
  let essayInserted = false;
  if (essay) {
    const essaySelectors = [
      'textarea[name*="essay" i]',
      'textarea[id*="essay" i]',
      'textarea[placeholder*="essay" i]',
      'textarea[name*="statement" i]',
      'textarea[aria-label*="essay" i]',
      'textarea[name*="answer" i]',
      '[contenteditable="true"][role="textbox"]',
      "textarea",
    ];
    for (const sel of essaySelectors) {
      const node = [...document.querySelectorAll(sel)].find(
        (el) => isVisible(el) && !(el.value && el.value.trim().length > 30)
      );
      if (node && setNativeValue(node, essay)) {
        essayInserted = true;
        break;
      }
    }
  }

  // 4. Optional submit.
  let submitted = false;
  let submitNote = "";
  if (doSubmit && !looksLikeLogin) {
    const candidates = [
      ...document.querySelectorAll(
        'button[type="submit"], input[type="submit"], button, [role="button"], a.button'
      ),
    ].filter(isVisible);
    const submitBtn = candidates.find((el) => {
      const t = normalize(el.textContent || el.value || "");
      return /(submit|apply now|apply|send application|finish|complete application)/.test(t);
    });
    if (submitBtn) {
      submitBtn.click();
      submitted = true;
      submitNote = `Clicked: ${(submitBtn.textContent || submitBtn.value || "").trim().slice(0, 40)}`;
    } else {
      submitNote = "No submit button found";
    }
  } else if (doSubmit && looksLikeLogin) {
    submitNote = "Login page detected — submit skipped";
  }

  return {
    filled,
    essayInserted,
    submitted,
    submitNote,
    isLogin: looksLikeLogin,
    fieldCount: fields.length,
  };
}
