// Some Windows DPI scales round requested sizes upward. Correct the observed
// difference once so repeated collapse/expand never feeds that rounding back.
function resizeWidgetHeight(window,height){
  height=Math.max(64,Math.min(900,height));
  const width=window.getContentSize()[0];
  window.setContentSize(width,height);
  const [actualWidth,actualHeight]=window.getContentSize();
  if(actualWidth!==width||actualHeight!==height)window.setContentSize(width-(actualWidth-width),height-(actualHeight-height));
}
module.exports={resizeWidgetHeight};
