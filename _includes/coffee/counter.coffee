data = {}
history = []

$ ->
  init()

  $('.adding-points .minus').click ->
    parentId = $(@).parents('.card').attr('id')
    data[parentId=='A'].currentPoints = if data[parentId=='A'].currentPoints <= -25 then -25 else data[parentId=='A'].currentPoints - 5
    data[parentId!='A'].currentPoints = if data[parentId!='A'].currentPoints >= 125 then 125 else data[parentId!='A'].currentPoints + 5
    update()

  $('.adding-points .plus').click ->
    parentId = $(@).parents('.card').attr('id')
    data[parentId=='A'].currentPoints = if data[parentId=='A'].currentPoints >= 125 then 125 else data[parentId=='A'].currentPoints + 5
    data[parentId!='A'].currentPoints = if data[parentId!='A'].currentPoints <= -25 then -25 else data[parentId!='A'].currentPoints - 5
    update()

  $('.dropdown-content a').click (event) ->
    parentId = $(@).parents('.card').attr('id')
    data[parentId=='A'].tichuModText = $(@).text()
    data[parentId=='A'].tichuMod = parseInt $(@).attr('data-value')
    update()

  $('.double-win-checkbox').click (event) ->
    parentId = $(@).parents('.card').attr('id')
    checked = $(@).prop('checked')
    data[parentId=='A'].doubleWin = checked
    data[parentId!='A'].doubleWin = false if checked
    update()

  $('#undo').click ->
    data = history.pop() if history.length
    update()

  $('#btn-next').click nextRound
  $('#reset').click init

init = ->
  for t in ['A','B']
    data[t=='A'] =
      points: 0
      currentPoints: 50
      tichuMod: 0
      tichuModText: 'No Tichu'
      doubleWin: false
  update()

update = ->
  for t in ['A','B']
    $('#'+t+' .points').text data[t=='A'].points
    tempPoints = (
      if data[t=='A'].doubleWin then 200 + data[t=='A'].tichuMod
      else if data[t!='A'].doubleWin then data[t=='A'].tichuMod
      else data[t=='A'].currentPoints + data[t=='A'].tichuMod
    )
    $('#'+t+' .temp-points').text tempPoints
    $("a.dropdown-button[data-activates='tichuDropdown" + t + "']").text data[t=='A'].tichuModText
    $('#'+t+' .double-win-checkbox').prop('checked', data[t=='A'].doubleWin)

nextRound = ->
  history.push $.extend(true, {}, data)
  for t in ['A','B']
    data[t=='A'].points += (
      if data[t=='A'].doubleWin then 200 + data[t=='A'].tichuMod
      else if data[t!='A'].doubleWin then data[t=='A'].tichuMod
      else data[t=='A'].currentPoints + data[t=='A'].tichuMod
    )
  for t in ['A','B']
    data[t=='A'].currentPoints = 50
    data[t=='A'].tichuMod = 0
    data[t=='A'].tichuModText = 'No Tichu'
    data[t=='A'].doubleWin = false
    $("a.dropdown-button[data-activates='tichuDropdown" + t + "']").text "No Tichu"
    $('.double-win-checkbox').prop('checked', false)
  update()
