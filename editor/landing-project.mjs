export function landingProject() {
  const files = [
    ['screen-recording-153438-10s.mp4', 504, 506, 'landing-video-3'],
    ['screenshotcutmov-10s.mp4', 504, 506, 'landing-video-4'],
    ['screen-recording-10s.mp4', 1438, 1162, 'landing-video-1'],
    ['untitled-10s.mp4', 800, 722, 'landing-video-2'],
  ];
  const width = 600, height = 506, gap = 96, margin = 32;
  const items = files.map(([name, sourceWidth, sourceHeight, id], index) => {
    const factor = Math.min(width / sourceWidth, height / sourceHeight);
    const w = sourceWidth * factor, h = sourceHeight * factor;
    return {
      id, name, kind: 'video',
      x: margin + (index % 2) * (width + gap) + (width - w) / 2,
      y: margin + Math.floor(index / 2) * (height + gap) + (height - h) / 2,
      w, h, src: '/assets/landing-' + name,
      background: 'transparent', borderWidth: 0, borderColor: '#000000', radius: 0, opacity: 1,
    };
  });
  return { id: 'landing', name: 'Landing page', layout: {
    version: 1, canvas: { width: width * 2 + gap + margin * 2, height: height * 2 + gap + margin * 2, background: 'transparent' }, items,
  } };
}
