
import { TextAlign } from '../types/scene';

export interface CaretPoint {
  x: number;
  y: number;
}

type DocumentWithCaret = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

export const placeCaretAtPoint = (element: HTMLElement, point: CaretPoint | null) => {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  selection.removeAllRanges();

  let range: Range | null = null;
  if (point) {
    const doc = document as DocumentWithCaret;
    if (typeof doc.caretRangeFromPoint === 'function') {
      range = doc.caretRangeFromPoint(point.x, point.y) ?? null;
    } else if (typeof doc.caretPositionFromPoint === 'function') {
      const position = doc.caretPositionFromPoint(point.x, point.y);
      if (position && position.offsetNode) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      }
    }
  }

  if (range && element.contains(range.startContainer)) {
    selection.addRange(range);
    return;
  }

  const fallback = document.createRange();
  fallback.selectNodeContents(element);
  fallback.collapse(false);
  selection.addRange(fallback);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const extractPlainText = (value: string): string => {
  if (!value) {
    return '';
  }

  const normalized = value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>(?=\n?)/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
};

export const ensureHtmlContent = (value: string, fallback = 'Untitled'): string => {
  const trimmed = value.trim();
  const defaultContent = `<p>${escapeHtml(fallback)}</p>`;
  if (!trimmed) {
    return defaultContent;
  }

  const hasTags = /<[^>]+>/.test(trimmed);
  if (!hasTags) {
    const escaped = escapeHtml(trimmed).replace(/\r?\n/g, '<br />');
    return `<p>${escaped}</p>`;
  }

  const plain = extractPlainText(trimmed);
  if (!plain) {
    return defaultContent;
  }

  return trimmed;
};

const focusEditor = (editor: HTMLElement) => {
  try {
    editor.focus({ preventScroll: true });
  } catch (error) {
    editor.focus();
  }
};

const withEditorSelection = (
  editor: HTMLElement,
  handler: (selection: Selection, range: Range) => boolean
): boolean => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    return false;
  }

  focusEditor(editor);
  return handler(selection, range);
};

const execFormattingCommand = (
  editor: HTMLElement,
  command: string,
  value?: string
): boolean =>
  withEditorSelection(editor, () => {
    document.execCommand('styleWithCSS', false, 'true');
    const result = document.execCommand(command, false, value ?? undefined);
    if (result) {
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return result;
  });

export const applyFontSizeToSelection = (editor: HTMLElement, size: number): boolean => {
  if (!Number.isFinite(size)) {
    return false;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    return false;
  }

  focusEditor(editor);
  document.execCommand('styleWithCSS', false, 'true');
  const succeeded = document.execCommand('fontSize', false, '7');
  if (!succeeded) {
    return false;
  }

  const updatedSelection = window.getSelection();
  if (!updatedSelection || updatedSelection.rangeCount === 0) {
    return false;
  }

  const updatedRange = updatedSelection.getRangeAt(0);
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (!(node instanceof HTMLElement)) {
        return NodeFilter.FILTER_SKIP;
      }
      return updatedRange.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });

  const affected: HTMLElement[] = [];
  while (walker.nextNode()) {
    const element = walker.currentNode as HTMLElement;
    if (element.style.fontSize) {
      element.style.fontSize = `${size}px`;
      affected.push(element);
    }
  }

  affected.forEach((element) => {
    if (element.tagName.toLowerCase() === 'font') {
      const span = document.createElement('span');
      span.style.fontSize = `${size}px`;
      while (element.firstChild) {
        span.appendChild(element.firstChild);
      }
      element.replaceWith(span);
    }
  });

  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
};

export const toggleBoldInSelection = (editor: HTMLElement): boolean => {
  return execFormattingCommand(editor, 'bold');
};

export const toggleItalicInSelection = (editor: HTMLElement): boolean =>
  execFormattingCommand(editor, 'italic');

export const toggleUnderlineInSelection = (editor: HTMLElement): boolean =>
  execFormattingCommand(editor, 'underline');

export const toggleStrikethroughInSelection = (editor: HTMLElement): boolean =>
  execFormattingCommand(editor, 'strikeThrough');

export const applyTextColorToSelection = (editor: HTMLElement, color: string): boolean =>
  execFormattingCommand(editor, 'foreColor', color);

export const toggleListInSelection = (
  editor: HTMLElement,
  type: 'unordered' | 'ordered'
): boolean =>
  execFormattingCommand(
    editor,
    type === 'unordered' ? 'insertUnorderedList' : 'insertOrderedList'
  );

export const applyAlignmentToSelection = (editor: HTMLElement, align: TextAlign): boolean => {
  const command = align === 'center' ? 'justifyCenter' : align === 'right' ? 'justifyRight' : 'justifyLeft';
  return execFormattingCommand(editor, command);
};
