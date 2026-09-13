"use client";

import grapesjs, { type Component, type Editor } from "grapesjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { sanitizeSlideCss, sanitizeSlideHtml } from "@/modules/slides/domain/structured/sanitize";

export interface SlideHtmlCanvasOptions {
  html: string;
  css: string;
  disabled?: boolean;
  onDirtyChange?(dirty: boolean): void;
}

export interface CanvasLayer {
  id: string;
  name: string;
  selected: boolean;
}

const EDIT_EVENTS = "component:update component:add component:remove component:styleUpdate";

function topLevelComponents(editor: Editor): Component[] {
  return editor.getWrapper()?.components().models ?? [];
}

// Owns the GrapesJS instance and every piece of canvas state, with no
// rendering opinion - see openspec/changes/abstract-slide-canvas-editor's
// design.md for why chrome is composed separately on top of this.
export function useSlideHtmlCanvas({ html, css, disabled = false, onDirtyChange }: SlideHtmlCanvasOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  // Host callbacks are usually inline arrows, so they must not be effect
  // dependencies: re-running the resync effect on every host render would
  // wipe in-progress edits and the undo history.
  const lastSyncedRef = useRef<{ html: string; css: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [, setRevision] = useState(0);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  const load = useCallback((instance: Editor, nextHtml: string, nextCss: string) => {
    instance.setComponents(nextHtml || "<div></div>");
    instance.setStyle(nextCss || "");
    instance.UndoManager.clear();
    lastSyncedRef.current = { html: nextHtml, css: nextCss };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let instance: Editor | null = null;
    try {
      instance = grapesjs.init({
        container,
        height: "100%",
        width: "100%",
        fromElement: false,
        storageManager: false,
        avoidDefaults: true,
      });
      load(instance, html, css);
      instance.on(EDIT_EVENTS, () => onDirtyChangeRef.current?.(true));
      instance.on(`${EDIT_EVENTS} component:selected component:deselected undo redo`, () => setRevision((value) => value + 1));
      editorRef.current = instance;
      setEditor(instance);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
    return () => {
      instance?.destroy();
      editorRef.current = null;
      setEditor(null);
    };
    // Mounted once; prop changes are applied by the resync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = editorRef.current;
    if (!instance) return;
    const last = lastSyncedRef.current;
    if (last && last.html === html && last.css === css) return;
    load(instance, html, css);
    setError(null);
    onDirtyChangeRef.current?.(false);
  }, [html, css, load]);

  const serialize = useCallback((): { html: string; css: string } | null => {
    const instance = editorRef.current;
    if (!instance) return null;
    try {
      const safe = {
        html: sanitizeSlideHtml(instance.getHtml(), "INVALID_INPUT"),
        css: sanitizeSlideCss(instance.getCss() ?? "", "INVALID_INPUT"),
      };
      // A host echoing the serialized content back as props must not
      // trigger a reload of what the canvas already shows.
      lastSyncedRef.current = safe;
      setError(null);
      return safe;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This slide could not be saved.");
      return null;
    }
  }, []);

  const undo = useCallback(() => {
    editorRef.current?.UndoManager.undo();
    setRevision((value) => value + 1);
  }, []);

  const redo = useCallback(() => {
    editorRef.current?.UndoManager.redo();
    setRevision((value) => value + 1);
  }, []);

  const addBlock = useCallback((content: string) => {
    const instance = editorRef.current;
    if (!instance || disabled) return;
    instance.getWrapper()?.append(content);
  }, [disabled]);

  const selectLayer = useCallback((id: string) => {
    const instance = editorRef.current;
    const target = instance && topLevelComponents(instance).find((component) => component.getId() === id);
    if (instance && target) instance.select(target);
  }, []);

  const moveLayer = useCallback((id: string, direction: "up" | "down") => {
    const instance = editorRef.current;
    const wrapper = instance?.getWrapper();
    if (!instance || !wrapper || disabled) return;
    const components = topLevelComponents(instance);
    const index = components.findIndex((component) => component.getId() === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= components.length) return;
    // GrapesJS removes the component before re-inserting, so `at` is the post-removal index.
    components[index].move(wrapper, { at: target });
  }, [disabled]);

  const selected = editor?.getSelected();
  const layers: CanvasLayer[] = editor
    ? topLevelComponents(editor).map((component) => ({ id: component.getId(), name: component.getName(), selected: component === selected }))
    : [];

  return {
    containerRef,
    editor,
    loadFailed,
    error,
    serialize,
    undo,
    redo,
    canUndo: editor?.UndoManager.hasUndo() ?? false,
    canRedo: editor?.UndoManager.hasRedo() ?? false,
    addBlock,
    layers,
    selectLayer,
    moveLayer,
  };
}

export type SlideHtmlCanvasController = ReturnType<typeof useSlideHtmlCanvas>;
