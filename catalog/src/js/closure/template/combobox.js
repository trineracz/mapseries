import goog from '../closure-lite';
import ms from '../ms';
import '../latlng';
import './valueitem';

import mapboxgl from 'mapbox-gl'
import languages from 'languages'


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

  /**
   * True if a combo box linked to a base can still be changed by the user
   * (it is prefilled from its base and offers all its configured values).
   * @type {boolean}
   */
  this.editable = false;

  /**
   * Index of the MARC field (template line) the combo box is in.
   * @type {number}
   */
  this.fieldIdx = -1;

  /**
   * MARC tag of the field the combo box is in.
   * @type {string}
   */
  this.tag = '';

  /**
   * Subfield code the combo box fills ('' outside subfields, e.g. indicators).
   * @type {string}
   */
  this.subfield = '';

  /**
   * Position of the combo box from the start of its MARC field
   * (3 = first indicator).
   * @type {number}
   */
  this.offset = -1;

  /**
   * Kind of authorities typed text is looked up in (e.g. 'corporation'),
   * or null when the combo box does not search the authority file.
   * @type {?string}
   */
  this.authorityType = null;

  /**
   * Called with the authority record the user picked from the search results.
   * @type {?function(Object)}
   */
  this.onAuthority = null;

  /**
   * Authority record that is the current value although the template does
   * not know it (its linked fields follow the record, not a template position).
   * @type {Object}
   */
  this.authority = null;

  /** @private {Array.<goog.ui.ComboBoxItem>} menu items of the search results */
  this.authorityItems_ = [];

  /** @private {?number} */
  this.searchTimer_ = null;

  /** @private {number} number of the latest search (older answers are dropped) */
  this.searchSeq_ = 0;

};
goog.inherits(ms.ComboBox, goog.ui.ComboBox);


/**
 * How long to wait after the last keystroke before searching (ms).
 * @type {number}
 */
ms.ComboBox.SEARCH_DELAY = 250;


/**
 * How many authorities to offer.
 * @type {number}
 */
ms.ComboBox.SEARCH_LIMIT = 10;


/**
 * Typing makes the value free text again, and in a combo box searching the
 * authority file it also looks the text up.
 * @override
 */
ms.ComboBox.prototype.handleInputChange_ = function() {
  this.authority = null;
  goog.ui.ComboBox.prototype.handleInputChange_.call(this);
  if (this.authorityType && document.activeElement == this.getInputElement()) {
    this.scheduleAuthoritySearch_();
  }
};


/**
 * Search the authority file for the typed text a moment after the last
 * keystroke and offer the results below the template values.
 * @private
 */
ms.ComboBox.prototype.scheduleAuthoritySearch_ = function() {
  clearTimeout(this.searchTimer_);
  var seq = ++this.searchSeq_;
  // only the name is searched, not the subfields after it ($$4 role, $$7 code)
  var query = goog.string.trim(this.getValue().split('$$')[0]);
  if (query.length < 2) {
    this.setAuthorityResults_(null);
    return;
  }
  var _this = this;
  this.searchTimer_ = setTimeout(function() {
    var params = new URLSearchParams({
      'q': query, 'type': _this.authorityType, 'limit': String(ms.ComboBox.SEARCH_LIMIT)
    });
    fetch('/api/authorities?' + params)
      .then(function(response) { return response.ok ? response.json() : null; })
      .then(function(results) {
        if (seq == _this.searchSeq_) {
          _this.setAuthorityResults_(results);
        }
      })
      .catch(function() {});
  }, ms.ComboBox.SEARCH_DELAY);
};


/**
 * Replace the offered search results.
 * @param {Array.<Object>} results authority records, or null for none.
 * @private
 */
ms.ComboBox.prototype.setAuthorityResults_ = function(results) {
  goog.array.forEach(this.authorityItems_, function(item) {
    var index = this.getMenu().indexOfChild(item);
    if (index >= 0) {
      this.removeItemAt(index);
    }
  }, this);
  this.authorityItems_ = [];
  if (!results) {
    return;
  }

  var header = new goog.ui.ComboBoxItem(languages.getText(
      results.length ? 'authority-results' : 'authority-none'));
  header.setEnabled(false);
  this.addAuthorityItem_(header, null);
  goog.array.forEach(results, function(record) {
    var item = new goog.ui.ComboBoxItem([
      document.createTextNode(record['heading']),
      goog.dom.createDom('span', 'authority-code', record['code'])
    ]);
    this.addAuthorityItem_(item, record);
  }, this);

  if (document.activeElement == this.getInputElement()) {
    this.maybeShowMenu_(false);
    this.positionMenu();
  }
};


/**
 * @param {goog.ui.ComboBoxItem} item menu item.
 * @param {Object} record authority record (null for the header).
 * @private
 */
ms.ComboBox.prototype.addAuthorityItem_ = function(item, record) {
  item.authority = record;
  // always shown (the server already matched it) and never reformatted
  item.setSticky(true);
  item.setFormatFromToken = function() {};
  item.createDom();
  goog.dom.classlist.add(item.getElement(), record ? 'authority-item' : 'authority-header');
  this.addItem(item);
  this.authorityItems_.push(item);
};


/**
 * A picked search result is handed over to onAuthority instead of its
 * caption becoming the value.
 * @override
 */
ms.ComboBox.prototype.onMenuSelected_ = function(e) {
  var item = e.target;
  if (!goog.isDef(item.authority)) {
    goog.ui.ComboBox.prototype.onMenuSelected_.call(this, e);
    return;
  }
  e.stopPropagation();
  var record = item.authority;
  this.dismiss();
  this.setAuthorityResults_(null);
  if (record && this.onAuthority) {
    this.onAuthority(record);
  }
};


/**
 * Make the given text the value as if it was picked from the menu (the menu
 * item at the given index is highlighted, so linked fields follow it).
 * @param {string} value value.
 * @param {number} index menu index, -1 for none.
 */
ms.ComboBox.prototype.pickValue = function(value, index) {
  this.dispatchEvent('action');
  this.getMenu().setHighlightedIndex(index);
  this.setLabelInputValue_(value);
  this.dispatchEvent('change');
  this.getMenu().setHighlightedIndex(-1);
};


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
 * Format one configured value for a sheet (a value may expand to several
 * strings separated by '|').
 * @param {*} value ValueItem or plain value.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @param {?string} baseValue current value of the base combo box.
 * @return {Array.<string>} formatted value(s).
 * @private
 */
ms.ComboBox.getValues_ = function(value, sheet, baseValue) {
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


/**
 * @param {*} value value.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @return {Array.<string>} formatted value(s).
 */
ms.ComboBox.prototype.formatValue = function(value, sheet) {
  if (this.valuesByBaseIndex && this.base && this.base.authority) {
    results = this.valueForAuthority_(this.base.authority, sheet);
  } else if (this.valuesByBaseIndex && this.base) {
    var bid = this.base.getMenu().getHighlightedIndex();
    if (bid > 0) {
      var valueItem = this.valuesByBaseIndex[bid - 1] || '';
      var results = ms.ComboBox.getValues_(valueItem, sheet, this.base.getValue());
    }
  } else {
    results = ms.ComboBox.getValues_(value, sheet, null);
  }
  results = results || [''];
  return results;
};


/**
 * Value of a combo box linked to a base whose value is an authority record
 * the template does not know: the record's code ($7) and indicator in the
 * base's own MARC field; the coded data of 008 stays as it was, or gets the
 * template's first value (the field has fixed positions); everything else is
 * left for the cataloger to fill in.
 * @param {Object} record authority record.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @return {Array.<string>} value.
 * @private
 */
ms.ComboBox.prototype.valueForAuthority_ = function(record, sheet) {
  if (this.fieldIdx === this.base.fieldIdx) {
    if (this.subfield === '7') {
      return [record['code']];
    }
    if (this.offset === 3) {
      return [record['ind1'] || '2'];
    }
  }
  if (this.tag === '008') {
    return [this.getInputElement().value || this.getBaseOptions(sheet)[0] || ''];
  }
  return [''];
};


/**
 * Value(s) of a combo box linked to a base for the given position in the base
 * (what it would get if that base option was chosen).
 * @param {number} index index into valuesByBaseIndex.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @return {Array.<string>} formatted value(s).
 */
ms.ComboBox.prototype.valueForBaseIndex = function(index, sheet) {
  var valueItem = this.valuesByBaseIndex[index] || '';
  return ms.ComboBox.getValues_(valueItem, sheet, this.base.getValue());
};


/**
 * All distinct non-empty values of a combo box linked to a base, in template
 * order — the options of an editable linked combo box.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @return {Array.<string>} options.
 */
ms.ComboBox.prototype.getBaseOptions = function(sheet) {
  var options = [];
  for (var i = 0; i < this.valuesByBaseIndex.length; i++) {
    goog.array.forEach(this.valueForBaseIndex(i, sheet), function(option) {
      if (option && goog.array.indexOf(options, option) < 0) {
        options.push(option);
      }
    });
  }
  return options;
};


/**
 * First position in the base whose value is the given value, or -1.
 * @param {string} value value.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @return {number} index into valuesByBaseIndex.
 */
ms.ComboBox.prototype.baseIndexOfValue = function(value, sheet) {
  if (!value) {
    return -1;
  }
  for (var i = 0; i < this.valuesByBaseIndex.length; i++) {
    if (goog.array.indexOf(this.valueForBaseIndex(i, sheet), value) >= 0) {
      return i;
    }
  }
  return -1;
};

export default ms.ComboBox;
