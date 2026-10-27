class Connection
  constructor: (@buttonId, @textFunc) ->

  destroy: () ->
    throw new Error('This is abstract method and must be overrided.')

class JSConnection extends Connection
  constructor: (buttonId, textFunc) ->
    super(buttonId, textFunc)
    @eventListener = null

    @__createEventListener()
    @__registerEventListener()

  destroy: () ->
    @__unregisterEventListener()

  __createEventListener: () ->
    @eventListener = () =>
      textToCopy = @textFunc();
      navigator.clipboard.writeText(textToCopy)
        .catch((err) -> console.log("Error when copying text to clipboard: #{err}"))

  __registerEventListener: () ->
    document.getElementById(@buttonId).addEventListener('click', @eventListener)

  __unregisterEventListener: () ->
    document.getElementById(@buttonId).removeEventListener('click', @eventListener)
    @eventListener = null

class Clipboard
  @instance = null

  @getInstance: () ->
    if @instance is null
      @instance = new Clipboard()

    return @instance

  constructor: () ->
    @connections = []

  deregisterButtons: () ->
    connection.destroy() for connection in @connections
    @connections = []

  # The old Flash (ZeroClipboard) fallback for browsers without the Clipboard
  # API was removed: Flash is gone from every browser, so it could not work.
  registerButton: (buttonId, textFunc) ->
    if @isJSApiSupported()
      @createJSConnection(buttonId, textFunc)
    else
      console.log('Clipboard API is not available (it needs HTTPS or localhost).')

  isJSApiSupported: () ->
    return navigator?.clipboard?.writeText

  createJSConnection: (buttonId, textFunc) ->
    @connections.push(new JSConnection(buttonId, textFunc))

export default Clipboard
