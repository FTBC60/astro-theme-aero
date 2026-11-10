// Standalone example; no theme imports, storage or network dependencies.
const input = document.getElementById('timestamp');
const result = document.getElementById('result');
const unit = () => document.querySelector('input[name="unit"]:checked').value;
function convert() {
  const raw = input.value.trim();
  const value = Number(raw);
  const date = new Date(unit() === 's' ? value * 1000 : value);
  if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(value) || !Number.isFinite(date.getTime())) {
    result.textContent = result.dataset.invalid;
    return;
  }
  result.textContent = 'UTC: ' + date.toISOString() + '\nLocal: ' + date.toLocaleString();
}
document.getElementById('convert').addEventListener('click', convert);
document.getElementById('now').addEventListener('click', () => {
  input.value = String(unit() === 's' ? Math.floor(Date.now() / 1000) : Date.now());
  convert();
});
document.documentElement.dataset.toolBuild = 'timestamp-1';
convert();

