import React, { useCallback, useState } from "react";
import { Application, extend } from "@pixi/react";
import * as PIXI from "pixi.js";
import * as Y from "yjs";
import { useYjsStore } from "../store/useYjsStore";

extend({ Container: PIXI.Container, Graphics: PIXI.Graphics });

const yStrokeToObj = (stroke: Y.Map<unknown>) =>
  stroke.toJSON() as {
    points: { x: number; y: number; pressure?: number }[];
    color: string;
    size: number;
  };

const CANVAS_SIZE = 1200;

const DrawingLayer = () => {
  const strokes = useYjsStore((state) => state.strokes);
  const awarenessStates = useYjsStore((state) => state.awarenessStates);
  const myClientId = useYjsStore(
    (state) => state.webrtcProvider?.awareness.clientID
  );
  const renderVersion = useYjsStore((state) => state.renderVersion);

  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      // debug: count strokes
      // eslint-disable-next-line no-console
      console.debug("[Pixi] draw called");

      const allStrokes = strokes ? strokes.toArray().map(yStrokeToObj) : [];
      // eslint-disable-next-line no-console
      console.debug("[Pixi] strokes count:", allStrokes.length);

      allStrokes.forEach((stroke) => {
        if (!stroke.points || stroke.points.length < 1) return;
        const color = parseInt(stroke.color.replace("#", ""), 16);
        g.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          g.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        g.stroke({ width: stroke.size, color, alpha: 1 });
      });

      awarenessStates.forEach((state, clientId) => {
        if (clientId !== myClientId && state.user && state.drawingStroke) {
          const stroke = state.drawingStroke;
          if (!stroke.points || stroke.points.length < 1) return;
          const color = parseInt(state.user.color.replace("#", ""), 16);
          g.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            g.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          g.stroke({ width: stroke.size, color, alpha: 0.7 });
        }
      });
    },
    [strokes, awarenessStates, myClientId, renderVersion]
  );

  return <pixiGraphics draw={draw} />;
};

const DrawingContainer = () => {
  const {
    yjsStatus,
    startStroke,
    addPointToStroke,
    endStroke,
    updateMyCursor,
  } = useYjsStore();
  const [isDrawing, setIsDrawing] = useState(false);
  const [cursor, setCursor] = useState<string>("auto");

  const handlePointerDown = (e: PIXI.FederatedPointerEvent) => {
    if (yjsStatus !== "connected") return;
    setCursor("crosshair");
    setIsDrawing(true);
    const { x, y } = e.global;
    const pressure = e.pressure || 0.5;
    // eslint-disable-next-line no-console
    console.debug("[Pixi] pointerdown", { x, y, pressure });
    updateMyCursor({ x, y });
    startStroke(x, y, pressure, "#000000", 5);
  };

  const handlePointerMove = (e: PIXI.FederatedPointerEvent) => {
    if (yjsStatus !== "connected") return;
    const { x, y } = e.global;
    const pressure = e.pressure || 0.5;
    // eslint-disable-next-line no-console
    console.debug("[Pixi] pointermove", { x, y, pressure });
    updateMyCursor({ x, y });
    if (isDrawing) addPointToStroke(x, y, pressure);
  };

  const handlePointerUp = () => {
    if (yjsStatus !== "connected") return;
    // eslint-disable-next-line no-console
    console.debug("[Pixi] pointerup");
    setCursor("auto");
    setIsDrawing(false);
    endStroke();
  };

  const handlePointerOut = () => {
    if (yjsStatus !== "connected") return;
    updateMyCursor(null);
  };

  return (
    <pixiContainer
      eventMode="static"
      hitArea={new PIXI.Rectangle(0, 0, CANVAS_SIZE, CANVAS_SIZE)}
      cursor={cursor}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerUpOutside={handlePointerUp}
      onPointerOut={handlePointerOut}
    >
      <DrawingLayer />
    </pixiContainer>
  );
};

export const PixiCanvas = () => {
  return (
    <Application
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      background={0xffffff}
      antialias
    >
      <DrawingContainer />
    </Application>
  );
};
