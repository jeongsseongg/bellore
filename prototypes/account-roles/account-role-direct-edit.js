export function bindRoleBlockInteractions(options) {
  const { root, previewWindow, setValue, getContent, markDirty, reorderBlock, refreshPreview, selectBlock } = options;
  let draggedBlock = null;
  root.addEventListener('dblclick', function (event) {
    const editable = event.target.closest('[data-inline-field]');
    if (!editable) return;
    event.preventDefault(); event.stopPropagation();
    editable.dataset.beforeEdit = editable.textContent;
    editable.contentEditable = 'true'; editable.classList.add('is-inline-editing'); editable.focus();
    const selection = previewWindow.getSelection();
    const range = previewWindow.document.createRange();
    range.selectNodeContents(editable); selection.removeAllRanges(); selection.addRange(range);
  });
  root.addEventListener('focusout', function (event) {
    const editable = event.target.closest('[data-inline-field].is-inline-editing');
    if (!editable) return;
    const value = editable.textContent.trim();
    if (value) { setValue(getContent(), editable.dataset.inlineField, value); markDirty(); }
    editable.contentEditable = 'false'; editable.classList.remove('is-inline-editing');
    refreshPreview(); selectBlock();
  });
  root.addEventListener('keydown', function (event) {
    const editable = event.target.closest('[data-inline-field].is-inline-editing');
    if (!editable) return;
    if (event.key === 'Enter') { event.preventDefault(); editable.blur(); }
    else if (event.key === 'Escape') { event.preventDefault(); editable.textContent = editable.dataset.beforeEdit || editable.textContent; editable.blur(); }
  });
  root.addEventListener('dragstart', function (event) {
    const block = event.target.closest('[data-preview-block][draggable="true"], [data-block-select][draggable="true"]');
    if (!block) return;
    draggedBlock = block.dataset.previewBlock || block.dataset.blockSelect;
    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', draggedBlock);
    root.classList.add('is-reordering');
  });
  root.addEventListener('dragover', function (event) {
    const target = event.target.closest('[data-preview-block], [data-block-select]');
    if (!target || !draggedBlock) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move';
  });
  root.addEventListener('drop', function (event) {
    const target = event.target.closest('[data-preview-block], [data-block-select]');
    if (!target || !draggedBlock) return;
    event.preventDefault(); reorderBlock(draggedBlock, target.dataset.previewBlock || target.dataset.blockSelect);
    draggedBlock = null; root.classList.remove('is-reordering');
  });
  root.addEventListener('dragend', function () { draggedBlock = null; root.classList.remove('is-reordering'); });
}
