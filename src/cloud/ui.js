// Dialog shown when a returning cloud user signs in with local guest data.
export function chooseMergeOrDiscard() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "keep-guest-title");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;";
    const box = document.createElement("div");
    box.style.cssText = "background:var(--surface,#fff);color:var(--on-surface,#222);max-width:420px;width:100%;padding:24px;border-radius:8px;";
    box.innerHTML =
      '<h5 id="keep-guest-title" style="margin-top:0">Keep guest data?</h5>' +
      "<p>This device has guest data, and your account already has data in the cloud.</p>" +
      '<button type="button" class="btn" data-choice="merge" style="display:block;width:100%;margin-bottom:12px">Merge into cloud</button>' +
      '<button type="button" class="btn-flat" data-choice="discard" style="display:block;width:100%">Discard local data</button>';
    box.addEventListener("click", (event) => {
      const choice = event.target && event.target.getAttribute("data-choice");
      if (!choice) return;
      overlay.remove();
      resolve(choice);
    });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector("button").focus();
  });
}
