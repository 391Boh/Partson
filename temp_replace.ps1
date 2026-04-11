$text = Get-Content -Encoding utf8 app/hero.tsx -Raw
$text = $text -replace 'Пр\?оритетна', 'Пріоритетна'
$text = $text -replace 'по вс\?й', 'по всій'
$text = $text -replace 'Персональн\?', 'Персональні'
$text = $text -replace 'рекомендац\?ї', 'рекомендації'
$text = $text -replace 'в\?д', 'від'
$text = $text -replace 'експерт\?в', 'експертів'
Set-Content -Encoding utf8 app/hero.tsx $text
