import React, {
  ForwardedRef,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { NodeModel } from '../types/scene';
import { CaretPoint, placeCaretAtPoint } from '../utils/text';
import '../styles/inline-text-editor.css';

interface InlineTextEditorProps {
  node: NodeModel;
  bounds: { x: number; y: number; width: number; height: number } | null;
  isEditing: boolean;
  scale: number;
  entryPoint: CaretPoint | null;
  onCommit: (value: string, metadata?: { linkUrl?: string }) => void;
  onCancel: () => void;
  shouldIgnoreBlur?: () => boolean;
}

export interface InlineTextEditorHandle {
  commit: () => void;
  cancel: () => void;
  getElement: () => HTMLDivElement | null;
}

const InlineTextEditorComponent = (
  {
    node,
    bounds,
    isEditing,
    scale,
    entryPoint,
    onCommit,
    onCancel,
    shouldIgnoreBlur
  }: InlineTextEditorProps,
  ref: ForwardedRef<InlineTextEditorHandle>
) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef(node.text);
  const linkValueRef = useRef(node.link?.url ?? '');
  const isComposingRef = useRef(false);
  const cancelledRef = useRef(false);
  const isLinkNode = node.shape === 'link';

  const readCurrentValue = useCallback(() => {
    const element = editorRef.current;
    if (!element) {
      return valueRef.current;
    }
    return element.innerHTML;
  }, []);

  const readCurrentLink = useCallback(() => {
    const input = linkInputRef.current;
    if (!input) {
      return linkValueRef.current;
    }
    return input.value;
  }, []);

  const commitValue = useCallback(() => {
    const text = readCurrentValue();
    valueRef.current = text;
    if (isLinkNode) {
      const link = readCurrentLink();
      linkValueRef.current = link;
      onCommit(text, { linkUrl: link });
    } else {
      onCommit(text);
    }
  }, [isLinkNode, onCommit, readCurrentLink, readCurrentValue]);

  const cancelEditing = useCallback(() => {
    cancelledRef.current = true;
    onCancel();
  }, [onCancel]);

  useImperativeHandle(
    ref,
    () => ({
      commit: () => {
        if (isEditing) {
          commitValue();
        }
      },
      cancel: () => {
        if (isEditing) {
          cancelEditing();
        }
      },
      getElement: () => editorRef.current
    }),
    [commitValue, cancelEditing, isEditing]
  );

  useEffect(() => {
    if (!isEditing) {
      valueRef.current = node.text;
      linkValueRef.current = node.link?.url ?? '';
      return;
    }

    const element = editorRef.current;
    if (!element) {
      return;
    }

    cancelledRef.current = false;
    isComposingRef.current = false;
    valueRef.current = node.text;
    element.innerHTML = node.text;

    if (isLinkNode) {
      const input = linkInputRef.current;
      const currentUrl = node.link?.url ?? '';
      linkValueRef.current = currentUrl;
      if (input) {
        input.value = currentUrl;
      }
    }

    const frame = requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      placeCaretAtPoint(element, entryPoint);
    });

    return () => cancelAnimationFrame(frame);
  }, [entryPoint, isEditing, isLinkNode, node.link?.url, node.text]);

  if (!isEditing || !bounds) {
    return null;
  }

  const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const inverseScale = 1 / normalizedScale;

  const paddingTop = 6;
  const paddingBottom = 10;
  const paddingX = 14;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: bounds.x,
    top: bounds.y,
    width: bounds.width * inverseScale,
    height: bounds.height * inverseScale,
    padding: `${paddingTop}px ${paddingX}px ${paddingBottom}px`,
    zIndex: 30,
    background: 'transparent',
    transform: `scale(${normalizedScale})`,
    transformOrigin: 'top left'
  };

  const contentStyle: React.CSSProperties = {
    fontSize: node.fontSize,
    fontWeight: node.fontWeight,
    lineHeight: 1.3,
    color: node.textColor,
    textAlign: node.textAlign,
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflow: 'hidden',
    caretColor: node.textColor,
    fontStyle: isLinkNode ? 'italic' : undefined,
    textDecoration: isLinkNode ? 'underline' : undefined,
    background: node.textBackground ?? 'transparent'
  };

  const handleInput = () => {
    valueRef.current = readCurrentValue();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      if (isComposingRef.current) {
        return;
      }
      event.preventDefault();
      commitValue();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  };

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (isComposingRef.current || cancelledRef.current) {
      return;
    }
    const related = event.relatedTarget as HTMLElement | null;
    if (related && linkInputRef.current && related === linkInputRef.current) {
      return;
    }
    if (shouldIgnoreBlur?.()) {
      return;
    }
    commitValue();
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    valueRef.current = readCurrentValue();
  };

  const handleLinkChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    linkValueRef.current = event.target.value;
  };

  const handleLinkKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      commitValue();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  };

  const handleLinkBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (isComposingRef.current || cancelledRef.current) {
      return;
    }
    const related = event.relatedTarget as HTMLElement | null;
    if (related && editorRef.current && related === editorRef.current) {
      return;
    }
    if (shouldIgnoreBlur?.()) {
      return;
    }
    commitValue();
  };

  return (
    <div
      className={`inline-text-editor ${isLinkNode ? 'inline-text-editor--link' : ''}`.trim()}
      style={containerStyle}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div
        ref={editorRef}
        className="inline-text-editor__content"
        style={contentStyle}
        contentEditable
        suppressContentEditableWarning
        spellCheck={true}
        translate="no"
        role="textbox"
        aria-multiline="true"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
      {isLinkNode && (
        <div className="inline-text-editor__link-field">
          <input
            ref={linkInputRef}
            type="url"
            className="inline-text-editor__link-input"
            placeholder="https://example.com"
            defaultValue={linkValueRef.current}
            onChange={handleLinkChange}
            onKeyDown={handleLinkKeyDown}
            onBlur={handleLinkBlur}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            spellCheck={false}
            autoComplete="off"
            aria-label="Link URL"
          />
        </div>
      )}
    </div>
  );
};

export const InlineTextEditor = forwardRef(InlineTextEditorComponent);
