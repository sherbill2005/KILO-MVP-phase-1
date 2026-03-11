export function addRow(setsBody, set) {
  const tr = document.createElement("tr");
  if (set.id) tr.dataset.setId = set.id;
  tr.innerHTML = `
    <td>${set.exercise_name}</td>
    <td>${set.weight_value} ${set.weight_unit}</td>
    <td>${set.reps}</td>
  `;
  setsBody.appendChild(tr);
}

export function setText(el, text) {
  if (el) el.textContent = text;
}

