import goog from './closure-lite';
import ms from './ms';

ms.latlng = {};



/**
 * Angle in degrees, minutes, and seconds (DMS).
 * @param {number} deg degrees.
 * @param {number} min minuntes.
 * @param {number} sec seconds.
 * @param {boolean} positive true if the angle is positive, otherwise false.
 * @constructor
 */
ms.latlng.DMS = function(deg, min, sec, positive) {
  /**
   * @type {boolean} degrees.
   */
  this.pos = positive;

  /**
   * @type {number} degrees.
   */
  this.deg = Math.abs(deg);

  /**
   * @type {number} minutes.
   */
  this.min = Math.abs(min);

  /**
   * @type {number} seconds.
   */
  this.sec = Math.abs(sec);
};


/**
 * Round DMS to second precision. Seconds became an integer.
 */
ms.latlng.DMS.prototype.round = function() {
  var sec = this.sec;
  sec = Math.round(sec);
  if (sec == 60) {
    sec = 0;
    var min = this.min + 1;
    if (min == 60) {
      min = 0;
      this.deg++;
    }
    this.min = min;
  }
  this.sec = sec;
};


/**
 * Get array of degrees, minutes, seconds, and sign.
 * @return {Array.<number>} [degrees,minutes,seconds,positive].
 */
ms.latlng.DMS.prototype.toArray = function() {
  return [this.deg, this.min, this.sec, this.pos];
};


/**
 * Format DMS to string.
 * @param {string} pattern Pattern wih folloowing tokens (wildcards):
 * d degrees
 * m minutes
 * s seconds
 * h hemisphere (north/south, east/west).
 * @param {string=} opt_positive a string that will replace hemisphere token
 * in case of positive angle.
 * @param {string=} opt_negative a string that will replace hemisphere token
 * in case of negative angle
 * Optional strings.
 * @return {string} formated DMS.
 */
ms.latlng.DMS.prototype.format = function(pattern, opt_positive, opt_negative) {
  if (!pattern || pattern.length == 0) {
    return '';
  }
  if (!opt_positive) {
    opt_positive = '+';
  }
  if (!opt_negative) {
    opt_negative = '-';
  }

  var firstLetter = pattern.substr(0, 1);
  var match;
  var substitute = null;
  switch (firstLetter) {
    case 'd':
      match = pattern.match(/^d+/)[0];
      substitute = goog.string.padNumber(Math.abs(this.deg), match.length);
      break;
    case 'm':
      match = pattern.match(/^m+/)[0];
      substitute = goog.string.padNumber(this.min, match.length);
      break;
    case 's':
      match = pattern.match(/^s+/)[0];
      substitute = goog.string.padNumber(this.sec, match.length);
      break;
    case 'h':
      match = 'h';
      substitute = this.pos ? opt_positive : opt_negative;
      break;
    default:
      match = pattern.match(/^[^hdms]+/)[0];
      substitute = match;
  }
  pattern = pattern.substring(match.length);

  return substitute + this.format(pattern, opt_positive, opt_negative);
};


/**
 * Convert angle from decimal degrees to degrees, minutes, and seconds (DMS).
 * Degrees and minutes are always integers, seconds can be double.
 * @param {number} decdeg angle in decimal degrees.
 * @param {boolean=} opt_round If true, result is rounded to second precision.
 * If false, second is double. Default is false.
 * @return {latlng.DMS} DMS object.
 */
ms.latlng.decToDMS = function(decdeg, opt_round) {
  var pos = (decdeg >= 0);
  var dec_abs = Math.abs(decdeg);

  var deg = Math.floor(dec_abs);
  var fragment = dec_abs - deg;

  var min = Math.floor(fragment / (1 / 60.0));
  fragment -= min * (1 / 60.0);

  var sec = fragment / (1 / 3600.0);

  var dms = new ms.latlng.DMS(deg, min, sec, pos);
  if (opt_round) {
    dms.round();
  }
  return dms;
};


/**
 * Convert bounding box to MARC 21 034 string.
 * @param {OpenLayers.Bounds} bbox latitude/longitude bounding box.
 * @return {string} string for 034.
 */
ms.latlng.bboxToMarc21_034 = function(bbox) {
  var north = ms.latlng.decToDMS(bbox.top, true);
  var south = ms.latlng.decToDMS(bbox.bottom, true);
  var west = ms.latlng.decToDMS(bbox.left, true);
  var east = ms.latlng.decToDMS(bbox.right, true);

  var north_str = 'N';
  var south_str = 'S';
  var east_str = 'E';
  var west_str = 'W';
  var pattern = 'hdddmmss';

  var result = '';
  result += '$$d' + west.format(pattern, east_str, west_str);
  result += '$$e' + east.format(pattern, east_str, west_str);
  result += '$$f' + north.format(pattern, north_str, south_str);
  result += '$$g' + south.format(pattern, north_str, south_str);

  return result;
};


/**
 * Convert bounding box to MARC 21 255 Czech string.
 * @param {OpenLayers.Bounds} bbox latitude/longitude bounding box.
 * @return {string} string for 255 in Czech.
 */
ms.latlng.bboxToMarc21_255InCzech = function(bbox) {
  var north = ms.latlng.decToDMS(bbox.top, true);
  var south = ms.latlng.decToDMS(bbox.bottom, true);
  var west = ms.latlng.decToDMS(bbox.left, true);
  var east = ms.latlng.decToDMS(bbox.right, true);

  var north_str = 's.š.';
  var south_str = 'j.š.';
  var east_str = 'v.d.';
  var west_str = 'z.d.';
  var pattern = 'ddd°mm\'ss" h';

  var result = '$$c';
  result += '(' + west.format(pattern, east_str, west_str);
  result += '--' + east.format(pattern, east_str, west_str);
  result += '/' + north.format(pattern, north_str, south_str);
  result += '--' + south.format(pattern, north_str, south_str);
  result += ')';

  return result;
};


/**
 * Convert bounding box to MARC 21 255 Czech string.
 * @param {OpenLayers.Bounds} bbox latitude/longitude bounding box.
 * @return {string} string for 255 in Czech.
 */
ms.latlng.bboxToMarc21_255InEnglish = function(bbox) {
  var north = ms.latlng.decToDMS(bbox.top, true);
  var south = ms.latlng.decToDMS(bbox.bottom, true);
  var west = ms.latlng.decToDMS(bbox.left, true);
  var east = ms.latlng.decToDMS(bbox.right, true);

  var north_str = 'N';
  var south_str = 'S';
  var east_str = 'E';
  var west_str = 'W';
  var pattern = 'h d°mm\'ss"';

  var result = '$$c';
  result += '(' + west.format(pattern, east_str, west_str);
  result += '--' + east.format(pattern, east_str, west_str);
  result += '/' + north.format(pattern, north_str, south_str);
  result += '--' + south.format(pattern, north_str, south_str);
  result += ')';

  return result;
};

export default ms.latlng;
