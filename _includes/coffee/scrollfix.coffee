$ ->
  initialY = null
  previousY = null

  $(document).on 'touchstart', (e) ->
    previousY = initialY = e.originalEvent.touches[0].clientY

    if($(document).scrollTop() <= 0)
      $(document).on("touchmove", blockScroll)

  blockScroll = (e) ->
    if(previousY && previousY < e.originalEvent.touches[0].clientY)
      console.log 'block'
      e.preventDefault()
    else if(initialY >= e.originalEvent.touches[0].clientY)
      $(document).off("touchmove")

    previousY = e.originalEvent.touches[0].clientY;

  $(document).on "touchend", (e) ->
    $(document).off("touchmove")
