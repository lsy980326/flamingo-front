export interface Page {
  _id: string;
  projectId: string;
  name: string;
  order: number;
}
export interface Canvas {
  _id: string;
  pageId: string;
  projectId: string;
  name: string;
  order: number;
  width: number;
  height: number;
  unit: string;
}
export interface Layer {
  _id: string;
  canvasId: string;
  projectId: string;
  name: string;
  order: number;
  type: string;
}
