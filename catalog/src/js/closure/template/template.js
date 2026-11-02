import goog from '../closure-lite';
import ms from '../ms';
import './combobox';

import Clipboard from 'clipboard'
import ebus from 'ebus'
import languages from 'languages'

/**
 * Template.
 * @constructor
 * @extends {goog.ui.Dialog}
 */
ms.Template = function () {
  goog.ui.Dialog.call(this, 'template-dialog');

  this.setDraggable(false);
  this.setButtonSet(null);

  /**
   * Fields.s
   * @type {Array.<ms.ComboBox>}
   */
  this.fields;
};
goog.inherits(ms.Template, goog.ui.Dialog);

ms.Template.prototype.createDom = function () {
  ms.Template.base(this, 'createDom');

  var dom = this.getDomHelper();
  dom.removeChildren(this.titleEl_);
  goog.dom.append(
    this.titleEl_,
    this.titleTextEl_ = dom.createDom(
      goog.dom.TagName.DIV, {
      'className': goog.getCssName(this.class_, 'title-text'),
      'id': this.getId()
    },
      this.title_),
    dom.createDom(
      goog.dom.TagName.DIV, {
      'className': goog.getCssName(this.class_, 'title-static-content'),
      'data-text-ref': 'sheet-detail'
    }
    )
  );
  var closeIcon = dom.createDom(
    goog.dom.TagName.I, {
    'className': 'fas fa-times'
  }
  );
  var closeText = dom.createDom(
    goog.dom.TagName.SPAN, {
    'data-text-ref': 'close'
  }
  );
  goog.dom.append(
    this.getElement(),
    this.closeBtnEl_ = dom.createDom(
      goog.dom.TagName.A, {
      'className': 'close-btn',
      'href': '#'
    },
      closeIcon, closeText
    )
  );
};

ms.Template.prototype.enterDocument = function () {
  ms.Template.base(this, 'enterDocument');

  this.getHandler().listen(
    this.closeBtnEl_, goog.events.EventType.CLICK, this.onTitleCloseClick_);
}

ms.Template.prototype.setTitle = function (title) {
  this.title_ = title;
  if (this.titleTextEl_) {
    goog.dom.safe.setInnerHtml(this.titleTextEl_, title);
  }
};

/**
 * Add listeners to dialog with decorated template content.
 * @private
 */
ms.Template.prototype.addTemplateListeners_ = function () {
  this.initClipboardHandler_();
};

ms.Template.prototype.initClipboardHandler_ = function () {
  let clipboard = Clipboard.getInstance();
  clipboard.deregisterButtons();
  clipboard.registerButton('clipboard_button', goog.bind(this.getTextToCopyAll_, this));
  clipboard.registerButton('clipboard_button_008', goog.bind(this.getTextToCopyField008_, this));
  clipboard.registerButton('clipboard_button_arl', goog.bind(this.getTextToCopyArl_, this));
}

ms.Template.prototype.getTextToCopyAll_ = function () {
  var container = this.getContentElement();
  var pre = goog.dom.getElementsByTagNameAndClass('pre', null, container)[0];
  var textToCopy = '';
  var node;
  for (var i = 0; i < pre.childNodes.length; i++) {
    node = pre.childNodes[i];
    switch (node.nodeType) {
      case goog.dom.NodeType.TEXT:
        textToCopy += node.nodeValue;
        break;
      case goog.dom.NodeType.ELEMENT:
        if (goog.dom.classlist.contains(node, 'combo')) {
          var field = goog.array.find(this.fields, function (field) {
            return node === field.getElement().parentNode;
          });
          textToCopy += field.getValue();
        } else if (goog.dom.classlist.contains(node, 'multipleValues')) {
          textToCopy += goog.dom.getRawTextContent(node);
        } else if (goog.dom.classlist.contains(node, 'year-text')) {
          textToCopy += goog.dom.getRawTextContent(node);
        }
        break;
    }
  }
  return textToCopy;
};

ms.Template.prototype.getTextToCopyArl_ = function () {
  var container = this.getContentElement();
  var pre = goog.dom.getElementsByTagNameAndClass('pre', null, container)[0];
  var textToCopy = '';
  var node;
  for (var i = 0; i < pre.childNodes.length; i++) {
    node = pre.childNodes[i];
    switch (node.nodeType) {
      case goog.dom.NodeType.TEXT:
        var res = node.nodeValue.match(/^FMT.*$/gm);
        if (goog.isArray(res) && res.length) {
          var lines = node.nodeValue.split('\n');
          lines.splice(0, 1);
          textToCopy += lines.join('\n');
        } else {
          textToCopy += node.nodeValue;
        }
        break;
      case goog.dom.NodeType.ELEMENT:
        if (goog.dom.classlist.contains(node, 'combo')) {
          var field = goog.array.find(this.fields, function (field) {
            return node === field.getElement().parentNode;
          });
          textToCopy += field.getValue();
        } else if (goog.dom.classlist.contains(node, 'multipleValues')) {
          textToCopy += goog.dom.getRawTextContent(node);
        } else if (goog.dom.classlist.contains(node, 'year-text')) {
          textToCopy += goog.dom.getRawTextContent(node);
        }
        break;
    }
  }
  //add space after three char in every line
  textToCopy = textToCopy.replace(/^(.{3})(\d+)/gm, "$1 $2");
  //Remove singular letter word L
  textToCopy = textToCopy.replace(/(^| )L( |$)/gm, " ");
  //Replace LDR with 000
  textToCopy = textToCopy.replace(/^LDR/g, "000");
  return textToCopy;
};

ms.Template.prototype.getTextToCopyField008_ = function () {
  var line008 = '';
  var allText = this.getTextToCopyAll_();
  var res = allText.match(/^008.*$/gm);
  if (goog.isArray(res) && res.length) {
    line008 = res[0];
  }
  return line008;
}

/**
 * Create template HTML content and ComboBoxes.
 * @param {string} template template string.
 * @param {ms.Series} series series.
 * @param {OpenLayers.Map} map map.
 * @private
 */
ms.Template.prototype.createHtmlAndComboBoxes_ = function (template, series, map, q = false) {
  this.fields = [];
  var _this = this;

  // where each JSON block sits (MARC field, tag) — in template order
  var blocks = this.describeBlocks_(template);
  var baseBlocks = goog.array.filter(blocks, function (b) { return b.base; });
  var blockIdx = 0;

  //create BASE combo boxes
  var html = this.replaceEveryJson_(template, function (json, str) {
    var block = blocks[blockIdx++];
    var baseId = json['base'];
    if (baseId) {
      return str;
    } else {
      return _this.createComboBox_(json, series, map, block);
    }
  });

  //create referring combo boxes (the base blocks left, in the same order)
  blockIdx = 0;
  html = this.replaceEveryJson_(html, function (json, str) {
    return _this.createComboBox_(json, series, map, baseBlocks[blockIdx++]);
  });

  html = '<pre>' + html + '</pre>';

  if (localStorage.getItem("templateFormat") === null) {
    localStorage.setItem("templateFormat", "aleph");
  }

  var templateFormat = localStorage.getItem("templateFormat");
  html += '<div class="clipboard-container">';
  html += '<select id="formatSelect" class="custom-select white black-bg" style="display:inline; margin-right:15px;">';
  if (templateFormat == "aleph") {
    html += '<option value="aleph" selected>Aleph</option>';
    html += '<option value="arl">ARL</option>';
    html += '</select>';
    html += '<a href="#" id="clipboard_button" data-text-ref="copy-to-clipboard"></a>';
    html += '<span id="button_separator" style="white"> / </span>';
    html += '<a href="#" id="clipboard_button_008" data-text-ref="copy-to-clipboard-008"></a>';
    html += '<a href="#" id="clipboard_button_arl" data-text-ref="copy-to-clipboard-arl" style="display:none"></a>';
  } else if (templateFormat == "arl") {
    html += '<option value="aleph">Aleph</option>';
    html += '<option value="arl" selected>ARL</option>';
    html += '</select>';
    html += '<a href="#" id="clipboard_button" data-text-ref="copy-to-clipboard" style="display:none"></a>';
    html += '<span id="button_separator" class="white" style="display:none"> / </span>';
    html += '<a href="#" id="clipboard_button_008" data-text-ref="copy-to-clipboard-008" style="display:none"></a>';
    html += '<a href="#" id="clipboard_button_arl" data-text-ref="copy-to-clipboard-arl"></a>';
  }
  html += '</div>';
  this.setSafeHtmlContent(goog.html.legacyconversions.safeHtmlFromString(html));

  $('.clipboard-container').ready(function () {
    $('#formatSelect').on('change', function () {
      localStorage.setItem("templateFormat", this.value);
      if (this.value == "arl") {
        $('#clipboard_button').hide();
        $('#clipboard_button_008').hide();
        $('#clipboard_button_arl').show();
        $('#button_separator').hide();
      } else if (this.value == 'aleph') {
        $('#clipboard_button').show();
        $('#clipboard_button_008').show();
        $('#clipboard_button_arl').hide();
        $('#button_separator').show();
      }
    });
  });
};

$(document).ready(function () {
  $('.coding2').hide();
});

/**
 * Create ComboBoxes.
 * @param {Object} json config JSON.
 * @param {ms.Series} series series.
 * @param {OpenLayers.Map} map map.
 * @param {Object=} block where the JSON block sits (see describeBlocks_).
 * @return {string} combobox HTML.
 * @private
 */
ms.Template.prototype.createComboBox_ = function (json, series, map, block) {
  var baseId = json['base'];

  if (baseId) {
    var base = goog.array.find(this.fields, function (cb) {
      return cb.id === baseId;
    });
    if (base) {
      goog.object.forEach(base.configObj, function (val, key) {
        if (key != 'id') {
          goog.object.setIfUndefined(json, key, val);
        }
      });
    }
  }

  var cb = new ms.ComboBox();
  cb.configurate(json, series, map);
  cb.base = base || null;
  cb.fieldIdx = block ? block.field : -1;
  cb.editable = !!(cb.base && cb.valuesByBaseIndex && block && block.editable);
  if (block) {
    cb.tag = block.tag;
    cb.subfield = block.subfield;
    cb.offset = block.offset;
  }
  // the corporation (110) and the related corporations (710) are looked up in
  // the authority file
  if (block && block.subfield === 'a' &&
      ((block.tag === '110' && cb.id && !cb.base) || (block.tag === '710' && cb.editable))) {
    cb.authorityType = 'corporation';
  }

  this.fields.push(cb);

  var cls = ['combo'];
  if ((base && !cb.editable) || cb.configObj['enabled'] === false) {
    cls.push('disabled');
  }
  cls = cls.join(' ');
  var divAttrs = {
    'id': 'templateComboBox' + (this.fields.length - 1),
    'class': cls,
  };
  var w = json['width'];
  if (w) {
    w = w * 8 + 16;
    divAttrs['style'] = 'width:' + w + 'px;';
  }
  if (cb.configObj['base'] == 'year2') {
    divAttrs['style'] += 'visibility: hidden;';
  }
  var title = json['title'];
  if (title) {
    divAttrs['title'] = title;
  }
  var el = goog.dom.createDom('div', divAttrs);
  var result = goog.dom.getOuterHtml(el);
  return result;
};


/**
 * Initialize combo boxes.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @param {ms.Series} series series.
 * @param {OpenLayers.Map} map map.
 * functions.
 * @private
 */
ms.Template.prototype.initComboBoxes_ = function (sheet, series, map) {
  var divs = goog.dom.getElementsByTagNameAndClass('div', 'combo',
    this.getContentElement());
  goog.array.forEach(divs, function (div) {
    var idx = parseInt(div.id.substr(16), 10);
    var cb = this.fields[idx];

    var caption = new goog.ui.ComboBoxItem(
      languages.getText(cb.authorityType ? 'authority-hint' : 'input-hint'));
    caption.setSticky(true);
    caption.setEnabled(false);
    cb.addItemAt(caption, 0);

    cb.render(div);
    var inputEl = cb.getInputElement();
    inputEl.style.width = div.style.width;

    var menuEl = cb.getMenu().getElement();
    var w = inputEl.style.width;
    w = parseInt(w.replace(/[^-\d\.]/g, ''), 10);
    if (w > 219) {
      menuEl.style.width = inputEl.style.width;
    }

    //add options
    this.addOptions_(cb, sheet);

    //synchronize values within group
    if (cb.id) {
      goog.events.listen(cb, 'change', function (evt) {
        //if template contains typ_data field, add more combobox
        if (cb.id == 'typ_data') {
          if (cb.getValue() != 'q') {
            document.querySelectorAll('.year-text').forEach(e => e.remove());
            goog.array.forEach(divs, function (div) {
              var idx = parseInt(div.id.substr(16), 10);
              var cb = this.fields[idx];
              if (cb.id == "year2") {
                cb.setValue("----");
                cb.setEnabled(false);
              } else if (cb.configObj.base == "year2") {
                cb.getElement().style.visibility = "hidden";
              }
            }, this);
          } else {
            goog.array.forEach(divs, function (div) {
              var idx = parseInt(div.id.substr(16), 10);
              var cb = this.fields[idx];
              if (cb.id == "year2") {
                cb.setValue("");
                cb.setEnabled(true);
              } else if (cb.configObj.base == "year") {
                cb.getElement().style.visibility = "visible";
                var div = goog.dom.getParentElement(cb.getElement());
                var p = document.createElement('p');
                p.classList.add("year-text");
                p.style.display = "inline";
                if (cb.configObj.title.startsWith("Rok")) {
                  var p_bracket = document.createElement('p');
                  p_bracket.classList.add("year-text");
                  p_bracket.style.display = "inline";
                  p_bracket.textContent = "[mezi ";
                  goog.dom.insertSiblingBefore(p_bracket, div);
                  p.textContent = " a ";
                } else if (cb.configObj.title.startsWith("Ozna")) {
                  p.textContent = "-";
                } else {
                  p.textContent = "";
                }
                goog.dom.insertSiblingAfter(p, div);
              } else if (cb.configObj.base == "year2") {
                cb.getElement().style.visibility = "visible";
                var div = goog.dom.getParentElement(cb.getElement());
                var p_bracket = document.createElement('p');
                if (cb.configObj.title.startsWith("Rok")) {
                  p_bracket.classList.add("year-text");
                  p_bracket.style.display = "inline";
                  p_bracket.textContent = "?]";
                  goog.dom.insertSiblingAfter(p_bracket, div);
                }
              }
            }, this);
          }
        }
        var cbs = this.getDependent_(cb);
        goog.array.forEach(cbs, function (groupMember) {
          var memberInput = groupMember.getInputElement();
          if (groupMember !== cb) {
            if (cb.getValue() != "----") {
              memberInput.value = groupMember.formatValue(cb.getValue(), sheet);
            } else {
              memberInput.value = groupMember.formatValue("", sheet);
            }
          }
        }, this);
      }, false, this);
    }

    // an editable linked field: choosing one of its values switches the other
    // linked fields of the same MARC field (e.g. the 710 indicator) to match
    if (cb.editable) {
      goog.events.listen(cb, 'change', function (evt) {
        var index = cb.baseIndexOfValue(cb.getValue(), sheet);
        if (index < 0) {
          return;
        }
        goog.array.forEach(this.fields, function (other) {
          if (other !== cb && other.base === cb.base && !other.editable &&
              other.fieldIdx === cb.fieldIdx && other.valuesByBaseIndex) {
            other.getInputElement().value = other.valueForBaseIndex(index, sheet);
          }
        });
      }, false, this);
    }

    //visual styles
    if ((cb.base && !cb.editable) || cb.configObj['enabled'] === false) {
      cb.setEnabled(false);
    } else {
      goog.events.listen(cb.getInputElement(), 'focus', function (evt) {
        var cbs = this.getDependent_(cb);
        cbs.push(cb);
        goog.array.forEach(cbs, function (depCombo) {
          var el = depCombo.getElement();
          goog.dom.classlist.add(el, 'active');
        });
      }, false, this);
      goog.events.listen(cb.getInputElement(), 'blur', function (evt) {
        var cbs = this.getDependent_(cb);
        cbs.push(cb);
        goog.array.forEach(cbs, function (depCombo) {
          var el = depCombo.getElement();
          goog.dom.classlist.remove(el, 'active');
        });
      }, false, this);
    }

    return cb;
  }, this);


  // fill every field
  goog.array.forEach(this.fields, function (cb) {

    if (cb.getItemCount() == 1) {
      cb.removeItemAt(0);
      goog.dom.classlist.add(cb.getElement(), 'no-arrow');
    }
    var el = cb.getElement();
    if (el) {
      var div = el.parentNode;
      if (div.title) {
        cb.setDefaultText(div.title + '...');
      }
    }
  }, this);

  this.initAuthorityFields_(sheet);

};


/**
 * Fields whose value is an identity: a heading paired with its authority code
 * ($7) — the corporation (110) and the related corporations (710) — and the
 * coded data of 008 that follows the corporation. Their values come from the
 * template or the authority file and are only picked, never typed: in 110 and
 * 710 typing searches the authority file, and text that is neither a template
 * value nor a picked authority is reverted when the field is left.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @private
 */
ms.Template.prototype.initAuthorityFields_ = function (sheet) {
  goog.array.forEach(this.fields, function (cb) {
    if (!cb.authorityType) {
      return;
    }
    if (cb.base) {
      this.initRelatedCorporation_(cb, sheet);
    } else {
      this.initCorporation_(cb, sheet);
    }
  }, this);
};


/**
 * The corporation (110), the base of most linked fields.
 * @param {ms.ComboBox} cb combo box.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @private
 */
ms.Template.prototype.initCorporation_ = function (cb, sheet) {
  var dependent = this.getDependent_(cb);
  var codeField = goog.array.find(dependent, function (dep) {
    return dep.fieldIdx === cb.fieldIdx && dep.subfield === '7' && dep.valuesByBaseIndex;
  });
  var codedFields = goog.array.filter(dependent, function (dep) {
    return dep.tag === '008' && dep.valuesByBaseIndex && !dep.editable;
  });

  // menu index of the template value, -1 if it is not one
  var templateIndex = function (value) {
    var highlighted = cb.getMenu().getHighlighted();
    if (highlighted && !goog.isDef(highlighted.authority) && highlighted.getCaption() === value) {
      return cb.getMenu().getHighlightedIndex();
    }
    for (var i = 0; i < cb.getItemCount(); i++) {
      var item = cb.getItemAt(i);
      if (item.isEnabled() && !goog.isDef(item.authority) && item.getCaption() === value) {
        return i;
      }
    }
    return -1;
  };

  var resolve = function () {
    var value = cb.getValue();
    if (value === '') {
      return { value: value, index: -1, authority: null };
    }
    var index = templateIndex(value);
    return index >= 0 ? { value: value, index: index, authority: null } : null;
  };

  this.makeSelectOnly_(cb, resolve, function (state) {
    cb.authority = state.authority;
    cb.pickValue(state.value, state.index);
  }, function () {
    return { value: cb.getValue(), index: templateIndex(cb.getValue()), authority: cb.authority };
  });

  // a corporation the template knows (same $7 code) is picked as the template
  // value, so that all linked fields follow it as before
  cb.onAuthority = function (record) {
    var index = -1;
    if (codeField) {
      for (var i = 0; i < codeField.valuesByBaseIndex.length && index < 0; i++) {
        if (goog.array.indexOf(codeField.valueForBaseIndex(i, sheet), record['code']) >= 0) {
          index = i + 1;
        }
      }
    }
    if (index > 0 && cb.getItemAt(index)) {
      cb.authority = null;
      cb.pickValue(cb.getItemAt(index).getCaption(), index);
    } else {
      cb.authority = record;
      cb.pickValue(record['marc'], -1);
    }
  };

  // the codes of 008 keep their value for a corporation the template does not
  // know and can be changed to another value of the template
  goog.events.listen(cb, 'change', function () {
    goog.array.forEach(codedFields, function (dep) {
      this.setCodedFieldEnabled_(dep, !!cb.authority, sheet);
    }, this);
  }, false, this);
};


/**
 * Unlock (or lock again) a coded field of 008 linked to the corporation; when
 * unlocked it offers the values of the template and accepts nothing else.
 * @param {ms.ComboBox} dep combo box.
 * @param {boolean} enabled whether to unlock it.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @private
 */
ms.Template.prototype.setCodedFieldEnabled_ = function (dep, enabled, sheet) {
  if (enabled && !dep.codedOptions_) {
    dep.codedOptions_ = dep.getBaseOptions(sheet);
    goog.array.forEach(dep.codedOptions_, function (option) {
      dep.addItem(new goog.ui.ComboBoxItem(option));
    });
    goog.dom.classlist.remove(dep.getElement(), 'no-arrow');
    this.makeSelectOnly_(dep, function () {
      var value = dep.getValue();
      return goog.array.indexOf(dep.codedOptions_, value) >= 0 ? value : null;
    }, function (value) {
      dep.pickValue(value, -1);
    }, function () {
      return dep.getValue();
    });
  }
  dep.setEnabled(enabled);
  goog.dom.classlist.enable(dep.getElement().parentNode, 'disabled', !enabled);
};


/**
 * A related corporation (710): a template value or one picked from the
 * authority file; only its relator ($$4) can be rewritten.
 * @param {ms.ComboBox} cb combo box.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @private
 */
ms.Template.prototype.initRelatedCorporation_ = function (cb, sheet) {
  // the heading and its code, without the relators
  var identity = function (value) {
    return goog.string.trim(value.replace(/\$\$4[^$]*/g, ''));
  };
  var options = cb.getBaseOptions(sheet);
  var allowed = goog.array.map(options, identity);
  allowed.push('');

  var indicators = goog.array.filter(this.fields, function (other) {
    return other !== cb && other.base === cb.base && !other.editable &&
      other.fieldIdx === cb.fieldIdx && other.offset === 3 && other.valuesByBaseIndex;
  });

  this.makeSelectOnly_(cb, function () {
    var value = cb.getValue();
    return goog.array.indexOf(allowed, identity(value)) >= 0 ? value : null;
  }, function (value) {
    cb.pickValue(value, -1);
  }, function () {
    return cb.getValue();
  });

  cb.onAuthority = function (record) {
    var code = '$$7' + record['code'];
    var value = goog.array.find(options, function (option) {
      return option.indexOf(code) >= 0;
    });
    if (!value) {
      // keep the relator of the current value (or the template's one)
      var relators = cb.getValue().match(/\$\$4[^$]*/g);
      for (var i = 0; !relators && i < options.length; i++) {
        relators = options[i].match(/\$\$4[^$]*/g);
      }
      value = record['marc'] + (relators || []).join('') + code;
      goog.array.forEach(indicators, function (ind) {
        ind.getInputElement().value = record['ind1'] || '2';
      });
    }
    allowed.push(identity(value));
    cb.pickValue(value, -1);
  };
};


/**
 * Make a combo box accept only valid values: when it is left after typing,
 * a valid value is applied again (so that linked fields follow it) and any
 * other text is replaced by the last valid value.
 * @param {ms.ComboBox} cb combo box.
 * @param {function(): *} resolve the state of a valid current value, or null.
 * @param {function(*)} restore apply a state.
 * @param {function(): *} current the state of the current value.
 * @private
 */
ms.Template.prototype.makeSelectOnly_ = function (cb, resolve, restore, current) {
  var input = cb.getInputElement();
  var typed = false;
  var last = current();
  goog.events.listen(input, 'beforeinput', function () {
    typed = true;
  });
  // picked from the menu (the template values or the authority file)
  goog.events.listen(cb, 'action', function () {
    typed = false;
  });
  goog.events.listen(cb, 'change', function () {
    if (!typed) {
      last = current();
    }
  });
  goog.events.listen(input, 'blur', function () {
    if (!typed) {
      return;
    }
    typed = false;
    var state = resolve();
    if (state !== null) {
      restore(state);
    } else {
      restore(last);
      ms.Template.showNotice_(cb, languages.getText('authority-only'));
    }
  });
};


/**
 * Show a short notice under a combo box.
 * @param {ms.ComboBox} cb combo box.
 * @param {string} text text.
 * @private
 */
ms.Template.showNotice_ = function (cb, text) {
  var el = cb.getElement();
  var old = document.querySelector('.combo-notice');
  if (old) {
    old.remove();
  }
  var rect = el.getBoundingClientRect();
  var notice = goog.dom.createDom('div', 'combo-notice', text);
  notice.style.left = rect.left + 'px';
  notice.style.top = rect.bottom + 2 + 'px';
  document.body.appendChild(notice);
  goog.dom.classlist.add(el, 'combo-reverted');
  setTimeout(function () {
    notice.remove();
    goog.dom.classlist.remove(el, 'combo-reverted');
  }, 4000);
};


/**
 * Add options to combo boxes.
 * @param {ms.ComboBox} cb combo box.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @private
 */
ms.Template.prototype.addOptions_ = function (cb, sheet) {
  if (cb.editable) {
    // all values the template has for this linked field (prefilled from the base)
    goog.array.forEach(cb.getBaseOptions(sheet), function (option) {
      cb.addItem(new goog.ui.ComboBoxItem(option));
    });
  } else if (!cb.base && (cb.values || cb.value)) {
    var values = cb.values || [cb.value];

    //create options
    var count = 0;
    var lastComboboxValue = '';
    if (cb.multipleValues) {
      var otherMultipleStringValues = [];
    }
    goog.array.forEach(values, function (valueItem) {
      var stringValues = cb.formatValue(valueItem, sheet);
      goog.array.forEach(stringValues, function (stringValue) {
        if (cb.multipleValues && count) {
          otherMultipleStringValues.push(stringValue);
        } else {
          cb.addItem(new goog.ui.ComboBoxItem(stringValue));
          count++;
          lastComboboxValue = stringValue;
        }
      });
    });
    //set value if there was only one value
    if (lastComboboxValue && count == 1) {
      cb.setValue(lastComboboxValue);
    }

    //set other multiple values
    if (cb.multipleValues && otherMultipleStringValues.length) {
      var cbdiv = goog.dom.getParentElement(cb.getElement());
      var content = '';
      goog.array.forEach(otherMultipleStringValues, function (stringValue) {
        content += cb.valueSeparator + stringValue;
      });
      var span = goog.dom.createDom('span', {
        'class': 'multipleValues',
        'title': cb.configObj['title'] || ''
      }, content);
      goog.dom.insertSiblingAfter(span, cbdiv);
    }
  }
};


/**
 * Show template for given sheet.
 * @param {OpenLayers.Feature.Vector} sheet sheet.
 * @param {ms.Series} series series.
 * @param {OpenLayers.Map} map map.
 */
ms.Template.prototype.showSheet = function (sheet, series, map) {
  var template = series.template;
  if (!template) {
    return;
  }

  this.createHtmlAndComboBoxes_(template, series, map);
  this.initComboBoxes_(sheet, series, map);


  //set label
  var sheetHtml = goog.html.SafeHtml.create('strong', null, sheet.properties['SHEET'])
  var label = goog.html.SafeHtml.concat(sheetHtml, ' - ', sheet.properties['TITLE'])
  this.setTitle(label);

  this.setVisible(true);
  this.reposition();
  this.addTemplateListeners_();

  ebus.fire('dialog-shown');

};


/**
 * Get dependent combo boxes.
 * @param {ms.ComboBox} mainCb combo box.
 * @return {Array.<ms.ComboBox>} comboboxes.
 * @private
 *
 */
ms.Template.prototype.getDependent_ = function (mainCb) {
  return goog.array.filter(this.fields, function (cb) {
    return cb.base === mainCb;
  });
};


/**
 * Fields linked to a base that stay editable by default: the subfields of the
 * added entries (710), the statement of responsibility (245 $c) and the place
 * and publisher (260/264) — catalogers need to adjust them per sheet, the
 * last two are transcribed from the map. Indicators stay locked and follow
 * the chosen value. A template can override it with "editable": true/false.
 * @type {Array.<string>}
 * @private
 */
ms.Template.EDITABLE_LINKED_TAGS_ = ['245', '260', '264', '710'];


/**
 * Describe every JSON block of the template, in template order: whether it is
 * linked to a base, the MARC field (line) it belongs to and its tag, whether
 * it is editable, the subfield it fills and its position in the field.
 * @param {string} template template string.
 * @return {Array.<{base: boolean, field: number, tag: string, editable: boolean,
 *     subfield: string, offset: number}>}
 * @private
 */
ms.Template.prototype.describeBlocks_ = function (template) {
  var found = [];
  this.replaceEveryJson_(template, function (json, str, start) {
    found.push({ json: json, start: start, end: start + str.length });
    return str;
  });
  // a MARC field starts at the beginning of a line that is not inside a block
  var fieldStarts = [];
  for (var p = 0; p < template.length; p = template.indexOf('\n', p) + 1 || template.length) {
    var inBlock = goog.array.find(found, function (b) { return p > b.start && p < b.end; });
    if (!inBlock) {
      fieldStarts.push(p);
    }
  }
  return goog.array.map(found, function (b) {
    var field = -1;
    for (var i = 0; i < fieldStarts.length && fieldStarts[i] <= b.start; i++) {
      field = i;
    }
    var tag = field >= 0 ? template.substr(fieldStarts[field], 3) : '';
    var base = !!b.json['base'];
    var before = field >= 0 ? template.substring(fieldStarts[field], b.start) : '';
    var marker = before.lastIndexOf('$$');
    // only subfield values ($$...), never indicators, are editable by default
    var inSubfield = marker >= 0;
    var editable = goog.isDef(b.json['editable']) ? !!b.json['editable'] :
      inSubfield && goog.array.indexOf(ms.Template.EDITABLE_LINKED_TAGS_, tag) >= 0;
    return {
      base: base, field: field, tag: tag, editable: base && editable,
      subfield: inSubfield ? before.charAt(marker + 2) : '',
      offset: field >= 0 ? before.length : -1
    };
  });
};


/**
 * Go through template and replace every JSON with result of given function
 * applied to this JSON.
 * @param {string} template template string.
 * @param {Function} f replace function.
 * @return {string} edited template.
 * @private
 */
ms.Template.prototype.replaceEveryJson_ = function (template, f) {
  var openBrackets = [];
  var idx;
  while ((idx = template.indexOf('{', idx ? idx + 1 : 0)) >= 0) {
    openBrackets.push(idx);
  }
  var closeBrackets = [];
  idx = null;
  while ((idx = template.indexOf('}', idx ? idx + 1 : 0)) >= 0) {
    closeBrackets.push(idx);
  }
  if (!openBrackets.length || !closeBrackets.length) {
    return template;
  }

  var findIndexOfNextOpenBracket = function (closebr) {
    var result = goog.array.find(openBrackets, function (openbr) {
      return openbr > closebr;
    });
    result = result ? goog.array.indexOf(openBrackets, result) : -1;
    return result;
  };
  var findIndexOfNextCloseBracket = function (openbr) {
    var result = goog.array.find(closeBrackets, function (closebr) {
      return closebr > openbr;
    });
    result = result ? goog.array.indexOf(closeBrackets, result) : -1;
    return result;
  };

  var closeBracket = -1;
  var openBracketIdx;
  var replacements = [];
  while ((openBracketIdx = findIndexOfNextOpenBracket(closeBracket)) >= 0) {
    var ob = openBrackets[openBracketIdx];
    var cbi = findIndexOfNextCloseBracket(ob);
    if (cbi < 0) {
      break;
    }
    var json;
    for (var i = cbi; i < closeBrackets.length; i++) {
      var cb = closeBrackets[i];
      var str = template.substring(ob, cb + 1);
      try {
        json = JSON.parse(str);
        break;
      } catch (e) {
        //try next loop
      }
    }
    if (json) {
      replacements.push([ob, cb + 1, f(json, str, ob)]);
    }
    closeBracket = cb;
  }
  for (i = replacements.length - 1; i >= 0; i--) {
    var repl = replacements[i];

    template = template.substr(0, repl[0]) +
      repl[2] + template.substr(repl[1]);
  }
  return template;
};


/**
 * @private
 * @inheritDoc
 * @suppress {accessControls}
 */
ms.Template.prototype.onKey_ = function (e) {
  var close = false;
  var hasHandler = false;
  var buttonSet = this.getButtonSet();
  var target = e.target;

  if (e.type == goog.events.EventType.KEYDOWN) {
    // Escape and tab can only properly be handled in keydown handlers.
    if (this.escapeToCancel_ && e.keyCode == goog.events.KeyCodes.ESC) {
      // Only if there is a valid cancel button is an event dispatched.
      var cancel = buttonSet && buttonSet.getCancel();

      // Users may expect to hit escape on a SELECT element.
      var isSpecialFormElement =
        target.tagName == 'SELECT' && !target.disabled;

      if (cancel && !isSpecialFormElement) {
        hasHandler = true;

        var caption = buttonSet.get(cancel);
        close = this.dispatchEvent(
          new goog.ui.Dialog.Event(cancel,
                /** @type {Element|null|string} */(caption)));
      } else if (!isSpecialFormElement) {
        close = true;
      }
    } else if (e.keyCode == goog.events.KeyCodes.TAB && e.shiftKey &&
      target == this.getElement()) {
      // Prevent the user from shift-tabbing backwards out of the dialog box.
      // Instead, set up a wrap in focus backward to the end of the dialog.
      this.setupBackwardTabWrap();
    }
  } else if (e.keyCode == goog.events.KeyCodes.ENTER) {
    // Only handle ENTER in keypress events, in case the action opens a
    // popup window.
    var key;
    if (target.tagName == 'BUTTON') {
      // If focus was on a button, it must have been enabled, so we can fire
      // that button's handler.
      key = target.name;
    } else if (buttonSet) {
      // Try to fire the default button's handler (if one exists), but only if
      // the button is enabled.
      var defaultKey = buttonSet.getDefault();
      var defaultButton = defaultKey && buttonSet.getButton(defaultKey);

      // Users may expect to hit enter on a TEXTAREA, SELECT or an A element.
      var isSpecialFormElement =
        (target.tagName == 'TEXTAREA' || target.tagName == 'SELECT' ||
          target.tagName == 'A') && !target.disabled;

      if (defaultButton && !defaultButton.disabled && !isSpecialFormElement) {
        key = defaultKey;
      }
    }
    if (key && buttonSet) {
      hasHandler = true;
      close = this.dispatchEvent(
        new goog.ui.Dialog.Event(key, String(buttonSet.get(key))));
    }
    var enter = close;
  }

  if (close || hasHandler) {
    e.stopPropagation();
    e.preventDefault();
  }

  if (close && !enter) {
    this.setVisible(false);
  }
};

export default ms.Template;
