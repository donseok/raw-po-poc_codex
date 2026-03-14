param(
  [string]$SourceDir = "docs"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Escape-Xml {
  param([string]$Text)

  if ($null -eq $Text) {
    return ""
  }

  return [System.Security.SecurityElement]::Escape($Text)
}

function Normalize-InlineMarkdown {
  param([string]$Text)

  if ($null -eq $Text) {
    return ""
  }

  $normalized = $Text -replace '\[([^\]]+)\]\(([^)]+)\)', '$1 ($2)'
  $normalized = $normalized -replace '`([^`]+)`', '$1'
  $normalized = $normalized -replace '\*\*([^*]+)\*\*', '$1'
  $normalized = $normalized -replace '__([^_]+)__', '$1'
  $normalized = $normalized -replace '(?<!\*)\*([^*]+)\*(?!\*)', '$1'
  $normalized = $normalized -replace '(?<!_)_([^_]+)_(?!_)', '$1'
  return $normalized
}

function New-RunXml {
  param(
    [string]$Text,
    [hashtable]$Style = @{}
  )

  $escaped = Escape-Xml $Text
  $runProps = New-Object System.Collections.Generic.List[string]

  if ($Style.ContainsKey("Bold") -and $Style.Bold) {
    [void]$runProps.Add("<w:b/>")
  }
  if ($Style.ContainsKey("Font") -and $Style.Font) {
    $font = Escape-Xml $Style.Font
    [void]$runProps.Add("<w:rFonts w:ascii=`"$font`" w:hAnsi=`"$font`" w:eastAsia=`"$font`" w:cs=`"$font`"/>")
  }
  if ($Style.ContainsKey("Size") -and $Style.Size) {
    [void]$runProps.Add("<w:sz w:val=`"$($Style.Size)`"/>")
    [void]$runProps.Add("<w:szCs w:val=`"$($Style.Size)`"/>")
  }
  if ($Style.ContainsKey("Color") -and $Style.Color) {
    [void]$runProps.Add("<w:color w:val=`"$($Style.Color)`"/>")
  }

  if ($runProps.Count) {
    return "<w:r><w:rPr>$($runProps -join '')</w:rPr><w:t xml:space=`"preserve`">$escaped</w:t></w:r>"
  }

  return "<w:r><w:t xml:space=`"preserve`">$escaped</w:t></w:r>"
}

function New-ParagraphXml {
  param(
    [string]$Text,
    [hashtable]$Style = @{},
    [string]$Prefix = ""
  )

  $paragraphProps = New-Object System.Collections.Generic.List[string]

  $hasSpaceBefore = $Style.ContainsKey("SpaceBefore") -and $null -ne $Style.SpaceBefore
  $hasSpaceAfter = $Style.ContainsKey("SpaceAfter") -and $null -ne $Style.SpaceAfter
  if ($hasSpaceBefore -or $hasSpaceAfter) {
    $before = if ($hasSpaceBefore) { $Style.SpaceBefore } else { 0 }
    $after = if ($hasSpaceAfter) { $Style.SpaceAfter } else { 0 }
    [void]$paragraphProps.Add("<w:spacing w:before=`"$before`" w:after=`"$after`"/>")
  }

  if ($Style.ContainsKey("IndentLeft") -and $Style.IndentLeft) {
    [void]$paragraphProps.Add("<w:ind w:left=`"$($Style.IndentLeft)`"/>")
  }

  if ($Style.ContainsKey("Shading") -and $Style.Shading) {
    [void]$paragraphProps.Add("<w:shd w:val=`"clear`" w:color=`"auto`" w:fill=`"$($Style.Shading)`"/>")
  }

  $runStyle = @{}
  if ($Style.ContainsKey("Bold") -and $Style.Bold) { $runStyle.Bold = $true }
  if ($Style.ContainsKey("Font") -and $Style.Font) { $runStyle.Font = $Style.Font }
  if ($Style.ContainsKey("Size") -and $Style.Size) { $runStyle.Size = $Style.Size }
  if ($Style.ContainsKey("Color") -and $Style.Color) { $runStyle.Color = $Style.Color }

  $runs = New-Object System.Collections.Generic.List[string]
  if ($Prefix) {
    [void]$runs.Add((New-RunXml -Text $Prefix -Style $runStyle))
  }
  [void]$runs.Add((New-RunXml -Text $Text -Style $runStyle))

  if ($paragraphProps.Count) {
    return "<w:p><w:pPr>$($paragraphProps -join '')</w:pPr>$($runs -join '')</w:p>"
  }

  return "<w:p>$($runs -join '')</w:p>"
}

function New-TableXml {
  param([object[]]$Rows)

  if (-not $Rows -or -not $Rows.Count) {
    return ""
  }

  $columnCount = 0
  foreach ($row in $Rows) {
    if ($row.Count -gt $columnCount) {
      $columnCount = $row.Count
    }
  }

  if ($columnCount -lt 1) {
    return ""
  }

  $grid = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $columnCount; $i++) {
    [void]$grid.Add('<w:gridCol w:w="2400"/>')
  }

  $tableRows = New-Object System.Collections.Generic.List[string]
  for ($rowIndex = 0; $rowIndex -lt $Rows.Count; $rowIndex++) {
    $cells = New-Object System.Collections.Generic.List[string]
    for ($cellIndex = 0; $cellIndex -lt $columnCount; $cellIndex++) {
      $cellText = ""
      if ($cellIndex -lt $Rows[$rowIndex].Count) {
        $cellText = Normalize-InlineMarkdown ($Rows[$rowIndex][$cellIndex].Trim())
      }
      $style = @{
        SpaceBefore = 0
        SpaceAfter = 0
      }
      if ($rowIndex -eq 0) {
        $style.Bold = $true
      }
      $paragraph = New-ParagraphXml -Text $cellText -Style $style
      [void]$cells.Add("<w:tc><w:tcPr><w:tcW w:w=`"2400`" w:type=`"dxa`"/></w:tcPr>$paragraph</w:tc>")
    }
    [void]$tableRows.Add("<w:tr>$($cells -join '')</w:tr>")
  }

  return @"
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>$($grid -join '')</w:tblGrid>
  $($tableRows -join '')
</w:tbl>
"@
}

function Convert-MarkdownToBodyXml {
  param([string]$Content)

  $content = $Content -replace "`r`n", "`n"
  $lines = $content -split "`n"
  $blocks = New-Object System.Collections.Generic.List[string]
  $i = 0

  while ($i -lt $lines.Count) {
    $line = $lines[$i]

    if ([string]::IsNullOrWhiteSpace($line)) {
      $i++
      continue
    }

    if ($line -match '^\s*```') {
      $i++
      while ($i -lt $lines.Count -and $lines[$i] -notmatch '^\s*```') {
        $codeLine = $lines[$i]
        [void]$blocks.Add((New-ParagraphXml -Text $codeLine -Style @{
          Font = "Consolas"
          Size = 18
          Shading = "F3F3F3"
          SpaceBefore = 0
          SpaceAfter = 0
        }))
        $i++
      }
      if ($i -lt $lines.Count -and $lines[$i] -match '^\s*```') {
        $i++
      }
      continue
    }

    if ($line -match '^(#{1,6})\s+(.*)$') {
      $level = $Matches[1].Length
      $text = Normalize-InlineMarkdown $Matches[2]
      $size = switch ($level) {
        1 { 32 }
        2 { 28 }
        3 { 24 }
        4 { 22 }
        default { 20 }
      }
      [void]$blocks.Add((New-ParagraphXml -Text $text -Style @{
        Bold = $true
        Size = $size
        SpaceBefore = 180
        SpaceAfter = 120
      }))
      $i++
      continue
    }

    if ($line.TrimStart().StartsWith("|")) {
      $tableLines = New-Object System.Collections.Generic.List[string]
      while ($i -lt $lines.Count -and $lines[$i].TrimStart().StartsWith("|")) {
        [void]$tableLines.Add($lines[$i])
        $i++
      }

      $rows = New-Object System.Collections.Generic.List[object]
      foreach ($tableLine in $tableLines) {
        if ($tableLine -match '^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$') {
          continue
        }
        $trimmed = $tableLine.Trim()
        if ($trimmed.StartsWith("|")) { $trimmed = $trimmed.Substring(1) }
        if ($trimmed.EndsWith("|")) { $trimmed = $trimmed.Substring(0, $trimmed.Length - 1) }
        $cells = @($trimmed.Split("|") | ForEach-Object { $_.Trim() })
        [void]$rows.Add($cells)
      }

      if ($rows.Count) {
        [void]$blocks.Add((New-TableXml -Rows $rows.ToArray()))
      }
      continue
    }

    if ($line -match '^\s*[-*]\s+(.*)$') {
      while ($i -lt $lines.Count -and $lines[$i] -match '^\s*[-*]\s+(.*)$') {
        $text = Normalize-InlineMarkdown $Matches[1]
        [void]$blocks.Add((New-ParagraphXml -Text $text -Prefix "- " -Style @{
          IndentLeft = 360
          SpaceBefore = 0
          SpaceAfter = 40
        }))
        $i++
      }
      continue
    }

    if ($line -match '^\s*(\d+\.\s+.*)$') {
      while ($i -lt $lines.Count -and $lines[$i] -match '^\s*(\d+\.\s+.*)$') {
        $text = Normalize-InlineMarkdown $Matches[1].Trim()
        [void]$blocks.Add((New-ParagraphXml -Text $text -Style @{
          IndentLeft = 360
          SpaceBefore = 0
          SpaceAfter = 40
        }))
        $i++
      }
      continue
    }

    $paragraphLines = New-Object System.Collections.Generic.List[string]
    while ($i -lt $lines.Count) {
      $current = $lines[$i]
      if ([string]::IsNullOrWhiteSpace($current)) { break }
      if ($current -match '^\s*```') { break }
      if ($current -match '^(#{1,6})\s+') { break }
      if ($current.TrimStart().StartsWith("|")) { break }
      if ($current -match '^\s*[-*]\s+') { break }
      if ($current -match '^\s*\d+\.\s+') { break }
      [void]$paragraphLines.Add($current.Trim())
      $i++
    }

    $paragraphText = Normalize-InlineMarkdown (($paragraphLines -join " ").Trim())
    if ($paragraphText) {
      [void]$blocks.Add((New-ParagraphXml -Text $paragraphText -Style @{
        SpaceBefore = 0
        SpaceAfter = 120
      }))
    }
  }

  return ($blocks -join "")
}

function Get-ContentTypesXml {
  return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
"@
}

function Get-PackageRelsXml {
  return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"@
}

function Get-DocumentXml {
  param([string]$BodyXml)

  return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    $BodyXml
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"@
}

function Get-CorePropsXml {
  param(
    [string]$Title,
    [string]$CreatedIso
  )

  $escapedTitle = Escape-Xml $Title
  return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>$escapedTitle</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">$CreatedIso</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">$CreatedIso</dcterms:modified>
</cp:coreProperties>
"@
}

function Get-AppPropsXml {
  param([string]$Application)

  $escaped = Escape-Xml $Application
  return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>$escaped</Application>
</Properties>
"@
}

function Write-Utf8File {
  param(
    [string]$Path,
    [string]$Content
  )

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path $directory)) {
    $null = New-Item -ItemType Directory -Path $directory
  }

  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Convert-MarkdownFileToDocx {
  param(
    [System.IO.FileInfo]$MarkdownFile,
    [string]$OutputPath
  )

  $markdown = Get-Content -Path $MarkdownFile.FullName -Raw -Encoding UTF8
  $bodyXml = Convert-MarkdownToBodyXml -Content $markdown
  $documentXml = Get-DocumentXml -BodyXml $bodyXml
  $timestamp = [DateTime]::UtcNow.ToString("s") + "Z"

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("md-docx-" + [guid]::NewGuid().ToString("N"))
  $null = New-Item -ItemType Directory -Path $tempRoot
  $null = New-Item -ItemType Directory -Path (Join-Path $tempRoot "_rels")
  $null = New-Item -ItemType Directory -Path (Join-Path $tempRoot "word")
  $null = New-Item -ItemType Directory -Path (Join-Path $tempRoot "docProps")

  try {
    Write-Utf8File -Path (Join-Path $tempRoot "[Content_Types].xml") -Content (Get-ContentTypesXml)
    Write-Utf8File -Path (Join-Path $tempRoot "_rels\.rels") -Content (Get-PackageRelsXml)
    Write-Utf8File -Path (Join-Path $tempRoot "word\document.xml") -Content $documentXml
    Write-Utf8File -Path (Join-Path $tempRoot "docProps\core.xml") -Content (Get-CorePropsXml -Title $MarkdownFile.BaseName -CreatedIso $timestamp)
    Write-Utf8File -Path (Join-Path $tempRoot "docProps\app.xml") -Content (Get-AppPropsXml -Application "Codex Markdown to DOCX")

    $zipPath = [System.IO.Path]::ChangeExtension($OutputPath, ".zip")
    if (Test-Path $zipPath) {
      Remove-Item $zipPath -Force
    }
    if (Test-Path $OutputPath) {
      Remove-Item $OutputPath -Force
    }

    Compress-Archive -Path (Join-Path $tempRoot "*") -DestinationPath $zipPath -Force
    Move-Item -Path $zipPath -Destination $OutputPath -Force
  }
  finally {
    if (Test-Path $tempRoot) {
      Remove-Item $tempRoot -Recurse -Force
    }
  }
}

$resolvedSourceDir = Resolve-Path -Path $SourceDir
$markdownFiles = Get-ChildItem -Path $resolvedSourceDir -Filter *.md | Sort-Object Name

if (-not $markdownFiles.Count) {
  throw "No markdown files found in '$SourceDir'."
}

foreach ($markdownFile in $markdownFiles) {
  $outputPath = Join-Path $markdownFile.DirectoryName ($markdownFile.BaseName + ".docx")
  Convert-MarkdownFileToDocx -MarkdownFile $markdownFile -OutputPath $outputPath
  Write-Output "Created: $outputPath"
}
