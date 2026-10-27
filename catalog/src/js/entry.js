// Build entry: jQuery globals first (the old webpack ProvidePlugin exposed
// $ / jQuery to every module, and bootstrap/bootbox/autocomplete expect them),
// then styles and the app itself (main.coffee defines window.main).
import './globals';
import '../css/main.less';
import './main';
