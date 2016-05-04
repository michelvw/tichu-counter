data = {}

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
    $("a.dropdown-button[data-activates='tichuDropdown" + parentId + "']").text $(@).text()
    data[parentId=='A'].tichuMod = parseInt $(@).attr('data-value')
    update()

  $('.double-win-checkbox').click (event) ->
    parentId = $(@).parents('.card').attr('id')
    checked = $(@).prop('checked')
    data[parentId=='A'].doubleWin = checked
    if checked
      $('#' + (if parentId=='A' then 'B' else 'A') + ' .double-win-checkbox').prop('checked', false)
      data[parentId!='A'].doubleWin = false
    update()

  $('#btn-next').click nextRound

init = ->
  for t in ['A','B']
    data[t=='A'] =
      points: 0
      currentPoints: 50
      tichuMod: 0
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

nextRound = ->
  for t in ['A','B']
    data[t=='A'].points += (
      if data[t=='A'].doubleWin then 200 + data[t=='A'].tichuMod
      else if data[t!='A'].doubleWin then data[t=='A'].tichuMod
      else data[t=='A'].currentPoints + data[t=='A'].tichuMod
    )
  for t in ['A','B']
    data[t=='A'].currentPoints = 50
    data[t=='A'].tichuMod = 0
    data[t=='A'].doubleWin = false
    $("a.dropdown-button[data-activates='tichuDropdown" + t + "']").text "No Tichu"
    $('.double-win-checkbox').prop('checked', false)
    update()
