import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from "react-native-svg";

// Mesmos desenhos de frontend/src/components/icons.jsx (traço 2.4, cantos redondos).
const SHAPES = {
  mic: [["rect", { x: 9, y: 2, width: 6, height: 12, rx: 3 }], ["path", { d: "M5 10a7 7 0 0 0 14 0" }], ["line", { x1: 12, y1: 19, x2: 12, y2: 22 }], ["line", { x1: 8, y1: 22, x2: 16, y2: 22 }]],
  micOff: [["line", { x1: 2, y1: 2, x2: 22, y2: 22 }], ["path", { d: "M9 9v3a3 3 0 0 0 4.6 2.55" }], ["path", { d: "M15 6.5V5a3 3 0 0 0-5.94-.6" }], ["path", { d: "M5 10a7 7 0 0 0 10.6 6" }], ["path", { d: "M18.9 13A7 7 0 0 0 19 10" }], ["line", { x1: 12, y1: 19, x2: 12, y2: 22 }], ["line", { x1: 8, y1: 22, x2: 16, y2: 22 }]],
  headphones: [["path", { d: "M3 13a9 9 0 0 1 18 0" }], ["rect", { x: 3, y: 13, width: 4, height: 7, rx: 1.5 }], ["rect", { x: 17, y: 13, width: 4, height: 7, rx: 1.5 }]],
  headphonesOff: [["line", { x1: 2, y1: 2, x2: 22, y2: 22 }], ["path", { d: "M3 13a9 9 0 0 1 15.5-6.3" }], ["path", { d: "M21 13a9 9 0 0 0-1.2-4.5" }], ["rect", { x: 3, y: 13, width: 4, height: 7, rx: 1.5 }], ["path", { d: "M17 13.6V20a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-2.6" }]],
  phoneOff: [["line", { x1: 2, y1: 2, x2: 22, y2: 22 }], ["path", { d: "M10.5 6.5a2 2 0 0 1 2-1.7l1.3.2a2 2 0 0 1 1.6 1.6l.4 2a2 2 0 0 1-.6 1.9l-1 1" }], ["path", { d: "M7.4 9.6a2 2 0 0 0-.4 2.2c.9 2.1 2.3 4.1 4.2 5.7.5.4 1.3.4 1.8-.1l1.4-1.4" }], ["path", { d: "M4.3 4.3 19.7 19.7" }]],
  hash: [["line", { x1: 5, y1: 9, x2: 19, y2: 9 }], ["line", { x1: 5, y1: 15, x2: 19, y2: 15 }], ["line", { x1: 10, y1: 4, x2: 8, y2: 20 }], ["line", { x1: 16, y1: 4, x2: 14, y2: 20 }]],
  volume: [["polygon", { points: "4 9 8 9 12 5 12 19 8 15 4 15 4 9" }], ["path", { d: "M16.5 8.5a5 5 0 0 1 0 7" }], ["path", { d: "M19 6a8.5 8.5 0 0 1 0 12" }]],
  screen: [["rect", { x: 2, y: 4, width: 20, height: 13, rx: 2 }], ["line", { x1: 8, y1: 21, x2: 16, y2: 21 }], ["line", { x1: 12, y1: 17, x2: 12, y2: 21 }], ["polyline", { points: "8 12 12 8 16 12" }], ["line", { x1: 12, y1: 8, x2: 12, y2: 14 }]],
  pip: [["rect", { x: 2, y: 4, width: 20, height: 16, rx: 3 }], ["rect", { x: 12, y: 11, width: 7, height: 6, rx: 1.5, fill: true }]],
  maximize: [["path", { d: "M8 3H5a2 2 0 0 0-2 2v3" }], ["path", { d: "M16 3h3a2 2 0 0 1 2 2v3" }], ["path", { d: "M21 16v3a2 2 0 0 1-2 2h-3" }], ["path", { d: "M8 21H5a2 2 0 0 1-2-2v-3" }]],
  settings: [["circle", { cx: 12, cy: 12, r: 3 }], ["path", { d: "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" }]],
  logout: [["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }], ["polyline", { points: "16 17 21 12 16 7" }], ["line", { x1: 21, y1: 12, x2: 9, y2: 12 }]],
  send: [["path", { d: "M22 2 11 13" }], ["path", { d: "M22 2 15 22 11 13 2 9z" }]],
  plus: [["line", { x1: 12, y1: 5, x2: 12, y2: 19 }], ["line", { x1: 5, y1: 12, x2: 19, y2: 12 }]],
  chevronLeft: [["path", { d: "m15 18-6-6 6-6" }]],
  eye: [["path", { d: "M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" }], ["circle", { cx: 12, cy: 12, r: 3 }]],
  user: [["path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }], ["circle", { cx: 12, cy: 7, r: 4 }]],
  palette: [["path", { d: "M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z" }], ["circle", { cx: 7.5, cy: 11.5, r: 1.2 }], ["circle", { cx: 10.5, cy: 7.5, r: 1.2 }], ["circle", { cx: 15.5, cy: 8.5, r: 1.2 }]],
  map: [["polygon", { points: "3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" }], ["line", { x1: 9, y1: 3, x2: 9, y2: 18 }], ["line", { x1: 15, y1: 6, x2: 15, y2: 21 }]],
  x: [["line", { x1: 18, y1: 6, x2: 6, y2: 18 }], ["line", { x1: 6, y1: 6, x2: 18, y2: 18 }]],
  check: [["polyline", { points: "20 6 9 17 4 12" }]],
  camera: [["path", { d: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" }], ["circle", { cx: 12, cy: 13, r: 4 }]],
  cameraOff: [["line", { x1: 1, y1: 1, x2: 23, y2: 23 }], ["path", { d: "M21 19a2 2 0 0 1-2 2H5.5" }], ["path", { d: "M3.5 15.5A2 2 0 0 1 3 15V8a2 2 0 0 1 2-2h4l2-3h4.2" }], ["path", { d: "M17.5 6H19a2 2 0 0 1 2 2v9.5" }], ["path", { d: "M14.5 13.4a4 4 0 0 1-5.9 2.1" }], ["path", { d: "M9.2 9.2A4 4 0 0 1 16 12" }]],
  switchCamera: [["polyline", { points: "17 1 21 5 17 9" }], ["path", { d: "M3 11V9a4 4 0 0 1 4-4h14" }], ["polyline", { points: "7 23 3 19 7 15" }], ["path", { d: "M21 13v2a4 4 0 0 1-4 4H3" }]],
  pencil: [["path", { d: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" }]],
  trash: [["polyline", { points: "3 6 5 6 21 6" }], ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }], ["line", { x1: 10, y1: 11, x2: 10, y2: 17 }], ["line", { x1: 14, y1: 11, x2: 14, y2: 17 }]],
  reply: [["polyline", { points: "9 17 4 12 9 7" }], ["path", { d: "M20 18v-2a4 4 0 0 0-4-4H4" }]],
  smile: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M8 14s1.5 2 4 2 4-2 4-2" }], ["line", { x1: 9, y1: 9, x2: 9.01, y2: 9 }], ["line", { x1: 15, y1: 9, x2: 15.01, y2: 9 }]],
  image: [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ["circle", { cx: 8.5, cy: 8.5, r: 1.5 }], ["polyline", { points: "21 15 16 10 5 21" }]],
  file: [["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }], ["polyline", { points: "14 2 14 8 20 8" }]],
  users: [["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }], ["circle", { cx: 9, cy: 7, r: 4 }], ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }], ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }]],
  message: [["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }]],
  search: [["circle", { cx: 11, cy: 11, r: 7 }], ["line", { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }]],
  block: [["circle", { cx: 12, cy: 12, r: 9 }], ["line", { x1: 5.5, y1: 18.5, x2: 18.5, y2: 5.5 }]],
  servers: [["rect", { x: 3, y: 3, width: 7.5, height: 7.5, rx: 2.2 }], ["rect", { x: 13.5, y: 3, width: 7.5, height: 7.5, rx: 2.2 }], ["rect", { x: 3, y: 13.5, width: 7.5, height: 7.5, rx: 2.2 }], ["rect", { x: 13.5, y: 13.5, width: 7.5, height: 7.5, rx: 2.2 }]],
  gif: [["rect", { x: 2, y: 5, width: 20, height: 14, rx: 3 }], ["path", { d: "M9 10H7.5a1.5 1.5 0 0 0-1.5 1.5v1A1.5 1.5 0 0 0 7.5 14H9v-2H8" }], ["line", { x1: 12, y1: 10, x2: 12, y2: 14 }], ["path", { d: "M18 10h-3v4M15 12h2" }]],
};

const TAGS = { rect: Rect, path: Path, line: Line, circle: Circle, polygon: Polygon, polyline: Polyline };

export default function Icon({ name, size = 20, color = "#000", strokeWidth = 2.4 }) {
  const shapes = SHAPES[name] || [];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {shapes.map(([tag, attrs], i) => {
        const Tag = TAGS[tag];
        const { fill, ...rest } = attrs;
        return <Tag key={i} {...rest} {...(fill ? { fill: color, stroke: "none" } : null)} />;
      })}
    </Svg>
  );
}
