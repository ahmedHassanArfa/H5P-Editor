module.exports = model => `<html>
<head>
<meta charset="UTF-8">
</head>
<body>

<h4>Existing Content</h4>

<ul>
${model.contentIds
    .map(id => `<li>${id} <a href="/play?contentId=${id}">[play]</a> <a href="/edit?contentId=${id}">[edit]</a></li>`)
    .join('')}
</ul>

<h4><a href="/edit">Create New Content</a></h4>
</body>
</html>`;
