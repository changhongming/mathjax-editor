import debounce from 'debounce'

import Blinker from './blinker'
import Cursor from './cursor'
import CursorMover from './cursor-mover'
import EventEmitter from './event-emitter'
import Rendered from './rendered'
import Tree from './tree'
import mml2Tex from './mml2tex'

import Promise from './utils/promise'
import addClass from './utils/add-class'
import appendElement from './utils/append-element'
import appendElementAfter from './utils/append-element-after'
import applyDelete from './utils/apply-delete'
import applyBackspace from './utils/apply-backspace'
import createElement from './utils/create-element'
import findTextarea from './utils/find-textarea'
import getElementJax from './utils/get-element-jax'
import getCleanCopy from './utils/get-clean-copy'
import hideElement from './utils/hide-element'
import isEditable from './utils/is-editable'
import lcc from './utils/lcc'
import listenElement from './utils/listen-element'
import px from './utils/px'
import prependElement from './utils/prepend-element'
import removeClass from './utils/remove-class'
import removeElement from './utils/remove-element'
import showElement from './utils/show-element'
import scrollTo from './utils/scroll-to'
import toDisplay from './utils/to-display'
import toDom from './utils/to-dom'
import unlistenElement from './utils/unlisten-element'

export default class Editor {
  /**
   * This is the main class of the Editor. 
   * 
   * @param {String|HTMLElement} selectors 
   * @param {Object} [options] 
   * @param {Boolean} [options.allowNewlines=false]
   * @param {String} [options.placeholder="Start typing..."]
   * @param {Boolean} [option.readonly=false]
   * 
   * @constructor
   */
  constructor(selectors, options = {}) {
    this.$el = findTextarea(selectors)
    this.$value = createElement('math')
    this.$input = createElement('input', 'mathjax-editor-input')
    this.$container = createElement('div', 'mathjax-editor-container')
    this.$display = createElement('div', 'mathjax-editor-display')
    this.$wrapper = createElement('div')
    this.$caret = createElement('div', 'mathjax-editor-caret')
    this.focused = false
    this.mouseAtDisplay = false
    this.emitter = new EventEmitter
    this.tree = new Tree(this.$value)
    this.rendered = new Rendered(this.$display, this.tree)
    this.cursor = new Cursor(this.tree, this.rendered, this.$caret)
    this.cursorMover = new CursorMover(this.tree, this.rendered, this.cursor)
    this.blinker = new Blinker(this.$caret)
    this.placeholder = options.placeholder || 'Start typing...'
    this.allowNewlines = options.allowNewlines || false
    this.readonly = options.readonly || false
    this.handleResize = debounce(this.handleResize.bind(this), 250)
    this.scrollToCaret = this.scrollToCaret.bind(this)
    
    hideElement(this.$caret)
    hideElement(this.$el)
    appendElement(this.$wrapper, this.$value)
    appendElement(this.$display, this.$wrapper, this.$caret)
    appendElement(this.$container, this.$display, this.$input)
    appendElementAfter(this.$el, this.$container)
    getElementJax(this.$display)
      .then(elementJax => {
        this.elementJax = elementJax
        this.update()
      })

    listenElement(this.$display, 'click', this.handleClick.bind(this))
    listenElement(this.$input, 'keyup', this.handleInput.bind(this))
    listenElement(this.$input, 'keydown', this.handleInput.bind(this))
    listenElement(this.$input, 'keydown', this.handleKeydown.bind(this))
    listenElement(this.$input, 'focus', this.handleFocus.bind(this))
    listenElement(this.$input, 'blur', this.handleBlur.bind(this))
    listenElement(this.$display, 'mouseenter', this.handleMouseenter.bind(this))
    listenElement(this.$display, 'mouseleave', this.handleMouseleave.bind(this))
    listenElement(this.$display, 'scroll', this.handleResize)
    listenElement(window, 'resize', this.handleResize)
  }

  /**
   * Handle the click event on the display.
   * 
   * @param {e} ClickEvent
   * 
   * @return {Void}
   */
  handleClick({ clientX, clientY }) {
    this.focus()
    this.cursorMover.click(clientX, clientY)
    this.blinker.freeze()
  }

  /**
   * Handle the focus event on the input.
   * 
   * @return {Void}
   */
  handleFocus() {
    this.emitter.emit('focus')
    this.focused = true
    addClass(this.$display, 'is-focused')
    showElement(this.$caret)
  }

  /**
   * Handle the blur event on the input.
   * 
   * @return {Void}
   */
  handleBlur() {
    if (this.mouseAtDisplay) {return}
    this.emitter.emit('blur')
    this.focused = false
    removeClass(this.$display, 'is-focused')
    hideElement(this.$caret)
  }

  /**
   * Handle the keyup/keydown event on the input.
   * 
   * @return {Void}
   */
  handleInput() {
    const input = this.$input.value.trim()
    this.$input.value = ''
    if (input.length) {
      this.emitter.emit('@input', input)
    }
  }

  /**
   * Handle the mouseenter event on the display.
   * 
   * @return {Void}
   */
  handleMouseenter() {
    this.mouseAtDisplay = true
  }

  /**
   * Handle the mouseleave event on the display.
   * 
   * @return {Void}
   */
  handleMouseleave() {
    this.mouseAtDisplay = false
  }

  /**
   * Handle the keydown event in the input.
   * 
   * @param {KeyboardEvent} e
   * 
   * @return {Void}
   */
  handleKeydown(e) {
    switch (e.which) {
    case 8: return this.backspaceRemove()
    case 13: return this.insertNewline()
    case 37: return this.cursor.moveLeft()
    case 39: return this.cursor.moveRight()
    case 46: return this.deleteRemove()
    // default: console.log(e.which)
    }
  }

  /**
   * Update the editor when the window is resized.
   * 
   * @return {Void}
   */
  handleResize() {
    this.update()
  }

  /**
   * Scroll the editor display to where the caret element is located.
   * 
   * @return {Void}
   */
  scrollToCaret() {
    scrollTo(this.$display, this.$caret)
  }

  /**
   * Update the editor tree, display, and cursor stuff.
   * 
   * @return {Promise}
   */
  update() {
    return new Promise(resolve => {
      if (!this.elementJax) {return resolve()}
      const value = this.getValue().outerHTML
      this.$wrapper.style.width = px(this.$wrapper.clientWidth)
      this.$wrapper.style.height = px(this.$wrapper.clientHeight)
      this.$el.value = value
      this.emitter.emit('update', value)
      this.tree.setValue(this.$value)
      this.tree.update()
      this.elementJax
        .setValue(toDisplay(this.$value, this.placeholder))
        .update()
        .then(() => {
          this.$wrapper.style.width = null
          this.$wrapper.style.height = null
          this.rendered.update()
          this.cursor.update()
          resolve()
        })
    })
  }

  /**
   * Apply a "backspace" deletion.
   * 
   * @return {Void}
   */
  backspaceRemove() {
    this.cursor.setPosition(
      applyBackspace(this.$value, this.cursor.getPosition())
    )
    this.update().then(this.scrollToCaret)
  }

  /**
   * Apply a "delete" deletion.
   * 
   * @return {Void}
   */
  deleteRemove() {
    this.cursor.setPosition(
      applyDelete(this.$value, this.cursor.getPosition())
    )
    this.update().then(this.scrollToCaret)
  }

  /**
   * Insert an element at current cursor position.
   * 
   * @param {HTMLElement} $el  
   * @param {HTMLElement} [$moveTo]
   * 
   * @return {Void}
   */
  insert($el, $moveTo = null) {
    const $position = this.cursor.getPosition()

    if (this.readonly && !isEditable($position)) {return}

    if (!$position) {
      prependElement(this.$value, $el)
    }
    else {
      switch (lcc($position.tagName)) {
      case 'mrow': prependElement($position, $el); break
      case 'math': appendElement(this.$value, $el); break
      default: appendElementAfter($position, $el)
      }
    }

    this.cursor.setPosition($moveTo || $el)
    this.focus()
    this.update().then(this.scrollToCaret)
  }

  /**
   * Insert a newline in the editor.
   * 
   * @return {Void}
   */
  insertNewline() {
    if (!this.allowNewlines) {return}
    const $position = this.cursor.getPosition()
    if (
      $position &&
      !lcc($position.tagName, 'math') && 
      !lcc($position.parentNode.tagName, 'math')
    ) {return}

    const $mspace = createElement('mspace', {
      linebreak: 'newline'
    })

    this.insert($mspace)
  }

  /**
   * Listen to an event of the editor.
   * 
   * @param {String} type 
   * @param {Function} listener
   * 
   * @return {Void}
   */
  on(type, listener) {
    return this.emitter.on(type, listener)
  }

  /**
   * Focus the editor.
   * 
   * @return {Void}
   */
  focus() {
    return this.$input.focus()
  }

  /**
   * Get the value of the editor as string.
   * 
   * @return {String}
   */
  toString() {
    return this.getValue().outerHTML
  }

  /**
   * Get the value of the editor as a tex string.
   * 
   * @return {String}
   */
  toTex() {
    return mml2Tex(this.$value)
  }

  /**
   * Get the value of the editor (a copy).
   * 
   * @return {HTMLElement}
   */
  getValue() {
    return getCleanCopy(this.$value)
  }

  /**
   * Set the value of the editor.
   * 
   * @param {HTMLElement} $value
   * 
   * @return {Void}
   */
  setValue($value) {
    if (typeof $value === 'string') {
      $value = toDom($value)
    }
    if ($value.nodeType !== 1 || !lcc($value.tagName, 'math')) {
      throw new Error('MathjaxEditor: the value must be an <math> element.')
    }
    this.$value = $value
    this.cursor.setPosition(null)
    this.update()
  }

  /**
   * Remove the editor element and event listeners.
   * 
   * @return {Void}
   */
  destroy() {
    this.blinker.destroy()
    removeElement(this.$container)
    unlistenElement(window, 'resize', this.handleResize)
  }
}