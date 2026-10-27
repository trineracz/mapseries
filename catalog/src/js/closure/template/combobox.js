import goog from '../closure-lite';
import ms from '../ms';
import '../latlng';
import './valueitem';

import mapboxgl from 'mapbox-gl'


/**
 * Template combo box.
 * @constructor
 * @extends {goog.ui.ComboBox}
 */
ms.ComboBox = function() {
  goog.ui.ComboBox.call(this);
  goog.Timer.defaultTimerObject = window;

  /**
   * Configuration object.
   * @type {Object}
   */
  this.configObj;

  /**
   * ID.
   * @type {string}
   */
  this.id;

  /**
   * Combobox which is leading for this combobox.
   * @type {ms.ComboBox}
   */
  this.base;

  /**
   * Array of values indexed as values of base combo box.
   * @type {Array.<ms.ValueItem>}
   */
  this.valuesByBaseIndex;

  /**
   * Array of values.
   * @type {Array.<ms.ValueItem>}
   */
  this.values;

  /**
   * Value.
   * @type {ms.ValueItem}
   */
  this.value;

  /**
   * True if all values should be in the template.
   * @type {boolean}
   */
  this.multipleValues;

  /**
   * Value separator (used only if multipleValues is true).
   * @type {string}
   */
  this.valueSeparator;

};
goog.inherits(ms.ComboBox, goog.ui.ComboBox);


/**
 * @param {Object} configObj configuration object.
 * @param {ms.Series} series series.
 * @param {OpenLayers.Map} map map.
 */
ms.ComboBox.prototype.configurate = function(configObj, series, map) {
  this.configObj = configObj;
  this.id = this.configObj['id'];

  var fillBbox = function(sheet) {

    var geometry = JSON.parse(sheet.properties['__GEOMETRY']);
    var coordinates = geometry.coordinates[0];

    // Pass the first coordinates in the LineString to `lngLatBounds` &
    // wrap each coordinate pair in `extend` to include them in the bounds
    // result. A variation of this technique could be applied to zooming
    // to the bounds of multiple Points or Polygon geomteries - it just
    // requires wrapping all the coordinates with the extend method.
    var bbox = coordinates.reduce(function(bounds, coord) {
        return bounds.extend(coord);
    }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

    return {
      top: bbox.getNorth(),
      bottom: bbox.getSouth(),
      left: bbox.getWest(),
      right: bbox.getEast()
    };
  };

  var loadValue = function(objValue) {
    var value = new ms.ValueItem();
    if (goog.isObject(objValue)) {
      value.attr = objValue['attr'];
      var ffname = objValue['formatFunction'];
      if (ffname) {
        switch (ffname) {
          case 'ms:marc21_0341_bbox':
            var ff = function(val, sh) {
              return ms.latlng.bboxToMarc21_034(fillBbox(sh));
            };
            break;
          case 'ms:marc21_255_bbox_czech':
            ff = function(val, sh) {
              return ms.latlng.bboxToMarc21_255InCzech(fillBbox(sh));
            };
            break;
          case 'ms:marc21_255_bbox_english':
            ff = function(val, sh) {
              return ms.latlng.bboxToMarc21_255InEnglish(fillBbox(sh));
            };
            break;
          default:
            ff = series.formatFunctions[ffname];
            break;

        }
        value.formatFunction = ff;
      }
    } else {
      value.value = objValue;
    }
    return value;
  };

  var objValues = configObj['values'];
  if (objValues) {
    this.values = goog.array.map(objValues, loadValue);
  }
  var objValuesByBaseIndex = configObj['valuesByBaseIndex'];
  if (objValuesByBaseIndex) {
    this.valuesByBaseIndex = goog.array.map(objValuesByBaseIndex, loadValue);
  }
  var objValue = configObj['value'];
  if (goog.isDef(objValue)) {
    this.value = loadValue(objValue);
  }
  this.multipleValues = !!configObj['multipleValues'];
  this.valueSeparator = configObj['valueSeparator'] || '';
};


/**
 * @param {*} value value.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @return {Array.<string>} formatted value(s).
 */
ms.ComboBox.prototype.formatValue = function(value, sheet) {

  var getValues = function(value, sheet, baseValue) {
    if (value instanceof ms.ValueItem) {
      var result = '';
      if (goog.isString(value.value)) {
        result = value.value;
      } else if (value.attr) {
        result = sheet.properties[value.attr];
      } else if (baseValue) {
        result = baseValue;
      }
      var ff = value.formatFunction;
    } else {
      result = value;
    }

    if (goog.isString(result)) {
      var results = result.split('|');
    } else {
      results = [result];
    }

    results = goog.array.map(results, function(res) {
      if (ff) {
        res = ff(res, sheet);
      }
      res = res || '';
      res += '';
      return res;
    });
    return results;
  };

  if (this.valuesByBaseIndex && this.base) {
    var bid = this.base.getMenu().getHighlightedIndex();
    if (bid > 0) {
      var valueItem = this.valuesByBaseIndex[bid - 1] || '';
      var results = getValues(valueItem, sheet, this.base.getValue());
    }
  } else {
    results = getValues(value, sheet, null);
  }
  results = results || [''];
  return results;
};

export default ms.ComboBox;
