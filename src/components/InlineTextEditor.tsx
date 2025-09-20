import React, {
  ForwardedRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { NodeModel } from '../types/scene';
import '../styles/selection-toolbar.css';

interface InlineTextEditorProps {
  node: NodeModel;
  bounds: { x: number; y: number; width: number; height: number } | null;
  isEditing: boolean;
  scale: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export interface InlineTextEditorHandle {
  commit: () => void;
  cancel: () => void;
}

const InlineTextEditorComponent = (
  { node, bounds, isEditing, scale, onCommit, onCancel }: InlineTextEditorProps,
  ref: ForwardedRef<InlineTextEditorHandle>
) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(node.text);

  useEffect(() => {
    if (isEditing) {
      setValue(node.text);
    }
  }, [isEditing, node.text]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [isEditing]);

  if (!isEditing || !bounds) {
    return null;
  }

  const padding = 10 * scale;
  const borderRadius = 14 * scale;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    padding: `${padding}px`,
    fontSize: node.fontSize * scale,
    fontWeight: node.fontWeight,
    lineHeight: 1.3,
    color: '#f8fafc',
    background: 'rgba(15, 23, 42, 0.92)',
    borderRadius,
    border: `${1.2 * scale}px solid rgba(148, 163, 184, 0.5)`,
    boxShadow: `0 ${18 * scale}px ${44 * scale}px rgba(2, 6, 23, 0.45)`,
    resize: 'none',
    outline: 'none',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    textAlign: node.textAlign,
    transformOrigin: 'top left',
    backgroundClip: 'padding-box'
  };

  const handleCommit = () => {
    onCommit(value);
  };

  useImperativeHandle(
    ref,
    () => ({
      commit: handleCommit,
      cancel: onCancel
    }),
    [value, onCommit, onCancel]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleCommit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    handleCommit();
  };

  return (
    <textarea
      ref={textareaRef}
      className="inline-text-editor"
      style={style}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      spellCheck={false}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    />
  );
};

export const InlineTextEditor = forwardRef(InlineTextEditorComponent);
