import ms from '../ms';



/**
 * One value item.
 * @constructor
 */
ms.ValueItem = function() {

  /**
   * Source attribute.
   * @type {string}
   */
  this.attr;

  /**
   * Format function name.
   * @type {Function}
   */
  this.formatFunction;

  /**
   * Value.
   * @type {*}
   */
  this.value;

};

export default ms.ValueItem;
