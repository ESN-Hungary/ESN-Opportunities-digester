/**
 * ESN Opportunities Weekly Digest
 *
 * ================================================================
 * WHAT THIS SCRIPT DOES
 * ================================================================
 *
 * 1. Looks through Gmail for threads containing messages from the
 *    PREVIOUS COMPLETED MONDAY-SUNDAY PERIOD.
 *
 * 2. Only messages addressed to:
 *
 *       opportunities@esn.org
 *
 *    are included.
 *
 * 3. Messages containing excluded keywords such as "reminder"
 *    are skipped.
 *
 * 4. A short excerpt is included in the digest.
 *
 * 5. The complete email is saved as HTML in Google Drive.
 *
 * 6. Each week's emails are stored in one folder:
 *
 *       ESN Opportunities Archive/
 *         17 Aug 2026 – 23 Aug 2026/
 *
 * 7. The weekly folder is shared with:
 *
 *       esn-bg-int-info@esnbg.org
 *
 *    Individual HTML files are NOT shared separately.
 *
 * 8. Folder sharing notifications are disabled.
 *
 * 9. The digest contains direct links to the archived HTML files.
 *
 *
 * ================================================================
 * SETUP
 * ================================================================
 *
 * 1. Paste this entire script into Google Apps Script.
 *
 * 2. In Apps Script:
 *
 *      Services → + → Drive API → Add
 *
 *    The Advanced Drive API is required for silent folder sharing.
 *
 * 3. Check CONFIG below.
 *
 * 4. Run:
 *
 *      sendWeeklyDigest()
 *
 *    manually once to authorize permissions and test.
 *
 * 5. Once confirmed, run:
 *
 *      createWeeklyTrigger()
 *
 *    once.
 *
 * ================================================================
 */


const CONFIG = {

  sourceEmail:
    'opportunities@esn.org',
  destinationGroup:
    'YOUR INTERNATIONAL OPPORTUNITIES GROUP',
  excludeKeywords:
    [
      'reminder'
    ],
  excerptLength:
    800,

  driveFolderName:
    'ESN Opportunities Archive',
  driveViewerGroup:
    'esn-bg-int-info@esnbg.org',

  digestSubjectPrefix:
    'ESN Opportunities Digest',

  triggerDay:
    ScriptApp.WeekDay.MONDAY,
  triggerHour:
    11
};


/**
 * ================================================================
 * MAIN FUNCTION
 * ================================================================
 *
 * Run this manually to test.
 */
function sendWeeklyDigest() {

  const period =
    getPreviousWeekPeriod();


  Logger.log(
    `Digest period: ` +
    `${formatDateTime(period.start)} → ` +
    `${formatDateTime(period.end)}`
  );

  const query =
    'after:' +
    formatGmailDate(period.start) +
    ' before:' +
    formatGmailDate(
      addDays(period.end, 1)
    );


  Logger.log(
    `Gmail search: ${query}`
  );

  const threads =
    GmailApp.search(query);

  Logger.log(
    `Found ${threads.length} matching Gmail thread(s).`
  );

  if (threads.length === 0) {

    Logger.log(
      'No matching threads found.'
    );

    return;
  }

  const rootFolder =
    getOrCreateArchiveRootFolder();


  const weeklyFolder =
    getOrCreateWeeklyFolder(
      rootFolder,
      period
    );

  ensureFolderSharedSilently(
    weeklyFolder.getId(),
    CONFIG.driveViewerGroup
  );

  const items = [];


  threads.forEach(
    thread => {

      const messages =
        thread.getMessages();


      messages.forEach(
        msg => {

          /*
           * ======================================================
           * DATE CHECK
           * ======================================================
           *
           * Gmail search results are THREADS.
           *
           * A thread might contain:
           *
           *   19 Aug 2026  ← recent
           *   10 Aug 2026  ← old
           *   01 Jul 2026  ← very old
           *
           * If we simply call thread.getMessages(), all three
           * messages are returned.
           *
           * Therefore the individual message date MUST be checked.
           */

          const messageDate =
            msg.getDate();


          if (
            messageDate < period.start ||
            messageDate > period.end
          ) {

            Logger.log(
              `Skipping message outside digest period: ` +
              `${formatDateTime(messageDate)} - ` +
              `${msg.getSubject()}`
            );

            return;
          }

          const targetEmail =
            CONFIG.sourceEmail.toLowerCase();


          const recipientFields = [

            msg.getTo() || '',

            msg.getCc() || '',

            msg.getBcc() || '',

            msg.getHeader(
              'Delivered-To'
            ) || '',

            msg.getHeader(
              'X-Original-To'
            ) || '',

            msg.getHeader(
              'Envelope-To'
            ) || ''

          ]
            .join(' ')
            .toLowerCase();


          if (
            recipientFields.indexOf(
              targetEmail
            ) === -1
          ) {

            Logger.log(
              `Skipping message not addressed to ` +
              `${CONFIG.sourceEmail}: ` +
              `${msg.getSubject()}`
            );

            return;
          }

          const plainText =
            htmlToPlainText(
              msg.getBody()
            );


          const searchText = (

            (msg.getSubject() || '') +
            ' ' +
            plainText

          ).toLowerCase();


          const isExcluded =
            CONFIG.excludeKeywords.some(
              keyword =>
                searchText.indexOf(
                  keyword.toLowerCase()
                ) !== -1
            );


          if (isExcluded) {

            Logger.log(
              `Excluded by keyword: ` +
              `${msg.getSubject()}`
            );

            return;
          }


          const archive =
            getOrCreateEmailArchive(
              msg,
              weeklyFolder
            );


          const excerpt =
            createExcerpt(
              msg.getBody(),
              CONFIG.excerptLength
            );


          items.push({

            id:
              msg.getId(),

            subject:
              stripEmoji(
                msg.getSubject() ||
                '(No subject)'
              ),

            from:
              msg.getFrom() ||
              '',

            date:
              messageDate,

            excerpt:
              excerpt,

            archiveUrl:
              archive.url

          });

        }
      );

    }
  );

  if (items.length === 0) {

    Logger.log(
      'No qualifying messages after filtering.'
    );

    return;
  }

  items.sort(
    (a, b) =>
      b.date.getTime() -
      a.date.getTime()
  );


  const dateRangeStr =
    `${formatDate(period.start)} – ${formatDate(period.end)}`;


  const html =
    buildDigestHtml(
      items,
      dateRangeStr,
      weeklyFolder.getUrl()
    );


  const plainText =
    buildDigestPlainText(
      items,
      dateRangeStr,
      weeklyFolder.getUrl()
    );


  GmailApp.sendEmail(

    CONFIG.destinationGroup,

    `${CONFIG.digestSubjectPrefix}: ${dateRangeStr}`,

    plainText,

    {
      htmlBody:
        html,

      name:
        'ESN Bulgaria Opportunities Digest'
    }

  );


  Logger.log(
    `Digest sent with ${items.length} item(s).`
  );


  Logger.log(
    `Archive folder: ${weeklyFolder.getUrl()}`
  );
}


/**
 * ================================================================
 * WEEK PERIOD CALCULATION
 * ================================================================
 *
 * Returns the PREVIOUS COMPLETED Monday-Sunday period.
 *
 * Example:
 *
 * If today is:
 *
 *   Monday 24 Aug 2026
 *
 * returns:
 *
 *   Monday 17 Aug 2026 00:00:00
 *   Sunday 23 Aug 2026 23:59:59
 *
 *
 * If today is:
 *
 *   Wednesday 26 Aug 2026
 *
 * returns:
 *
 *   Monday 17 Aug 2026 00:00:00
 *   Sunday 23 Aug 2026 23:59:59
 *
 *
 * This means a manual run during the week still processes the
 * last COMPLETED week rather than a rolling seven-day window.
 */
function getPreviousWeekPeriod() {

  const now =
    new Date();

  const dayOfWeek =
    now.getDay();

  const daysSinceMonday =
    dayOfWeek === 0
      ? 6
      : dayOfWeek - 1;

  const currentMonday =
    new Date(now);


  currentMonday.setDate(
    currentMonday.getDate() -
    daysSinceMonday
  );

  currentMonday.setHours(
    0,
    0,
    0,
    0
  );

  const previousMonday =
    new Date(
      currentMonday
    );


  previousMonday.setDate(
    previousMonday.getDate() -
    7
  );


  previousMonday.setHours(
    0,
    0,
    0,
    0
  );

  const previousSunday =
    new Date(
      currentMonday
    );


  previousSunday.setMilliseconds(
    -1
  );


  return {

    start:
      previousMonday,

    end:
      previousSunday

  };
}


function formatGmailDate(
  date
) {

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'yyyy/MM/dd'
  );
}


function getOrCreateArchiveRootFolder() {

  const folders =
    DriveApp.getFoldersByName(
      CONFIG.driveFolderName
    );


  if (
    folders.hasNext()
  ) {

    return folders.next();

  }


  return DriveApp.createFolder(
    CONFIG.driveFolderName
  );
}


function getOrCreateWeeklyFolder(
  rootFolder,
  period
) {

  const folderName =
    `${formatDate(period.start)} – ` +
    `${formatDate(period.end)}`;


  const folders =
    rootFolder.getFoldersByName(
      folderName
    );


  if (
    folders.hasNext()
  ) {

    return folders.next();

  }


  const folder =
    rootFolder.createFolder(
      folderName
    );


  Logger.log(
    `Created weekly folder: ${folderName}`
  );


  return folder;
}


/**
 * ================================================================
 * SILENT DRIVE SHARING
 * ================================================================
 *
 * Shares ONLY the weekly folder.
 *
 * Individual files inherit the folder's permissions.
 *
 * Requires:
 *
 *   Apps Script → Services → Drive API → Add
 */
function ensureFolderSharedSilently(
  folderId,
  groupEmail
) {

  let permissions;


  try {

    permissions =
      Drive.Permissions.list(
        folderId
      ).permissions || [];

  } catch (error) {

    throw new Error(
      'Could not read Drive permissions. ' +
      'Make sure the Advanced Drive service is enabled. ' +
      'Original error: ' +
      error
    );
  }


  const existingPermission =
    permissions.find(
      permission =>
        (
          permission.emailAddress || ''
        ).toLowerCase() ===
        groupEmail.toLowerCase()
    );


  if (
    existingPermission
  ) {

    Logger.log(
      `Weekly folder already shared with ${groupEmail}.`
    );

    return;
  }


  try {

    Drive.Permissions.create(

      {
        type:
          'group',

        role:
          'reader',

        emailAddress:
          groupEmail
      },

      folderId,

      {
        sendNotificationEmail:
          false,

        supportsAllDrives:
          true
      }

    );


    Logger.log(
      `Shared weekly folder silently with ${groupEmail}.`
    );

  } catch (error) {

    throw new Error(
      `Could not share weekly folder with ` +
      `${groupEmail}. ` +
      `Make sure the Apps Script account has permission ` +
      `to share the folder. Original error: ${error}`
    );
  }
}


function getOrCreateEmailArchive(
  msg,
  weeklyFolder
) {

  const messageId =
    msg.getId();


  const filename =
    createArchiveFilename(
      msg
    );

  const existingFiles =
    weeklyFolder.getFilesByName(
      filename
    );


  while (
    existingFiles.hasNext()
  ) {

    const file =
      existingFiles.next();


    /*
     * Check Gmail message ID to avoid accidentally treating
     * another message with the same subject as the same email.
     */
    if (
      file.getDescription() ===
      `Gmail message ID: ${messageId}`
    ) {

      Logger.log(
        `Reusing existing archive: ${filename}`
      );


      return {

        file:
          file,

        url:
          file.getUrl()

      };
    }
  }


  const originalHtml =
    msg.getBody();

  const cleanedHtml =
    sanitizeEmailHtml(
      originalHtml
    );

  const archiveHtml =
    buildArchiveHtml(
      msg,
      cleanedHtml
    );

  const file =
    weeklyFolder.createFile(
      filename,
      archiveHtml,
      MimeType.HTML
    );

  file.setDescription(
    `Gmail message ID: ${messageId}`
  );

  Logger.log(
    `Created archive: ${filename}`
  );


  return {

    file:
      file,

    url:
      file.getUrl()

  };
}


function buildArchiveHtml(
  msg,
  emailHtml
) {

  const subject =
    escapeHtml(
      stripEmoji(
        msg.getSubject() ||
        '(No subject)'
      )
    );


  const from =
    escapeHtml(
      msg.getFrom() ||
      ''
    );


  const date =
    escapeHtml(
      formatDateTime(
        msg.getDate()
      )
    );


  return `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>${subject}</title>


<style>

html,
body {

  margin:0;
  padding:0;

}


body {

  background:#f5f5f5;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  color:#222222;

}


.archive-header {

  max-width:900px;

  margin:24px auto 0 auto;

  padding:20px 24px;

  box-sizing:border-box;

  background:#ffffff;

  border-bottom:1px solid #dddddd;

}


.archive-header h1 {

  margin:0 0 10px 0;

  font-size:22px;

  line-height:1.35;

}


.archive-meta {

  font-size:13px;

  line-height:1.5;

  color:#666666;

}


.email-content {

  max-width:900px;

  margin:0 auto 24px auto;

  padding:24px;

  box-sizing:border-box;

  background:#ffffff;

  overflow-x:auto;

}


.email-content img {

  max-width:100% !important;

  height:auto !important;

}


.email-content table {

  max-width:100%;

}


@media (max-width:600px) {

  .archive-header,
  .email-content {

    margin:0;

    padding:16px;

  }


  .archive-header h1 {

    font-size:19px;

  }

}

</style>

</head>


<body>


<div class="archive-header">

  <h1>
    ${subject}
  </h1>


  <div class="archive-meta">

    <strong>From:</strong>
    ${from}

    <br>

    <strong>Received:</strong>
    ${date}

  </div>

</div>


<div class="email-content">

  ${emailHtml}

</div>


</body>

</html>
`;
}


/**
 * ================================================================
 * DIGEST
 * ================================================================
 */


/**
 * Build HTML digest.
 */
function buildDigestHtml(
  items,
  dateRangeStr,
  weeklyFolderUrl
) {

  const rows =
    items.map(
      item => `

<div style="
  margin:0 0 24px 0;
  padding:0 0 20px 0;
  border-bottom:1px solid #dddddd;
">


  <h3 style="
    margin:0 0 6px 0;
    font-family:Arial,sans-serif;
    font-size:17px;
    line-height:1.35;
    color:#222222;
  ">

    ${escapeHtml(item.subject)}

  </h3>


  <div style="
    margin:0 0 12px 0;
    font-family:Arial,sans-serif;
    font-size:12px;
    line-height:1.4;
    color:#777777;
  ">

    ${escapeHtml(item.from)}

    ·

    ${formatDate(item.date)}

  </div>


  <div style="
    font-family:Arial,sans-serif;
    font-size:14px;
    line-height:1.55;
    color:#333333;
  ">

    ${item.excerpt}

  </div>


  <div style="
    margin-top:12px;
  ">

    <a
      href="${escapeAttribute(item.archiveUrl)}"
      style="
        font-family:Arial,sans-serif;
        font-size:13px;
        font-weight:bold;
        color:#003399;
        text-decoration:none;
      "
    >

      Read full email →

    </a>

  </div>


</div>

`
    ).join('');


  return `

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

</head>


<body style="
  margin:0;
  padding:0;
  background:#ffffff;
">


<div style="
  max-width:680px;
  margin:0 auto;
  padding:24px 20px;
  font-family:Arial,sans-serif;
">


  <h2 style="
    margin:0 0 8px 0;
    padding:0 0 10px 0;
    border-bottom:2px solid #003399;
    color:#003399;
    font-size:22px;
  ">

    ESN Opportunities Digest

  </h2>


  <p style="
    margin:0 0 24px 0;
    font-size:13px;
    line-height:1.5;
    color:#666666;
  ">

    Covering
    ${escapeHtml(dateRangeStr)}

    ·

    ${items.length}

    opportunit${items.length === 1 ? 'y' : 'ies'}

  </p>


  ${rows}


  <p style="
    margin:24px 0 0 0;
    font-size:11px;
    line-height:1.5;
    color:#999999;
  ">

    Auto-generated weekly digest of messages addressed to
    ${escapeHtml(CONFIG.sourceEmail)}.

    <br><br>

    <a
      href="${escapeAttribute(weeklyFolderUrl)}"
      style="
        color:#777777;
      "
    >

      Open this week's archive folder

    </a>

  </p>


</div>


</body>

</html>

`;
}


function buildDigestPlainText(
  items,
  dateRangeStr,
  weeklyFolderUrl
) {

  let text =
    `ESN Opportunities Digest\n\n` +
    `Covering ${dateRangeStr}\n\n`;


  items.forEach(
    (item, index) => {

      text +=

        `${index + 1}. ${item.subject}\n` +

        `From: ${item.from}\n` +

        `Date: ${formatDate(item.date)}\n\n` +

        `${stripHtml(item.excerpt)}\n\n` +

        `Read full email:\n` +

        `${item.archiveUrl}\n\n` +

        `----------------------------------------\n\n`;

    }
  );


  text +=
    `This week's archive folder:\n` +
    `${weeklyFolderUrl}`;


  return text.trim();
}


function createExcerpt(
  html,
  maxLength
) {

  let cleaned =
    htmlToExcerptHtml(
      html
    );


  const plain =
    stripHtml(cleaned)
      .replace(/\s+/g, ' ')
      .trim();


  if (
    plain.length <= maxLength
  ) {

    return cleaned;
  }


  let excerpt =
    plain.substring(
      0,
      maxLength
    );


  /*
   * Avoid cutting a word in half.
   */
  const lastSpace =
    excerpt.lastIndexOf(' ');


  if (
    lastSpace >
    maxLength * 0.7
  ) {

    excerpt =
      excerpt.substring(
        0,
        lastSpace
      );
  }


  excerpt =
    escapeHtml(
      excerpt.trim()
    );


  return (
    `<div>${excerpt}…</div>`
  );
}


/**
 * Convert HTML into excerpt-friendly content.
 */
function htmlToExcerptHtml(
  html
) {

  let text =
    html;

  text =
    text

      .replace(
        /<script[\s\S]*?<\/script>/gi,
        ''
      )

      .replace(
        /<style[\s\S]*?<\/style>/gi,
        ''
      )

      .replace(
        /<head[\s\S]*?<\/head>/gi,
        ''
      )

      .replace(
        /<img[^>]*>/gi,
        ''
      )

      .replace(
        /<svg[\s\S]*?<\/svg>/gi,
        ''
      )

      .replace(
        /<form[\s\S]*?<\/form>/gi,
        ''
      )

      .replace(
        /<iframe[\s\S]*?<\/iframe>/gi,
        ''
      )

      .replace(
        /<footer[\s\S]*?<\/footer>/gi,
        ''
      );


  /*
   * Convert block endings to line breaks.
   */
  text =
    text

      .replace(
        /<\/(p|div|section|article|li|tr|h[1-6])>/gi,
        '\n'
      )

      .replace(
        /<br\s*\/?>/gi,
        '\n'
      );

  text =
    text

      .replace(
        /<(strong|b)(?:\s[^>]*)?>/gi,
        '<strong>'
      )

      .replace(
        /<\/(strong|b)>/gi,
        '</strong>'
      )

      .replace(
        /<(em|i)(?:\s[^>]*)?>/gi,
        '<em>'
      )

      .replace(
        /<\/(em|i)>/gi,
        '</em>'
      );

  text =
    text.replace(
      /<[^>]*>/g,
      ''
    );

  text =
    decodeHtmlEntities(
      text
    );

  text =
    stripEmoji(
      text
    );

  text =
    escapeHtml(
      text
    );

  text =
    text

      .replace(
        /&lt;strong&gt;/gi,
        '<strong>'
      )

      .replace(
        /&lt;\/strong&gt;/gi,
        '</strong>'
      )

      .replace(
        /&lt;em&gt;/gi,
        '<em>'
      )

      .replace(
        /&lt;\/em&gt;/gi,
        '</em>'
      );

  text =
    text

      .replace(
        /[ \t]+/g,
        ' '
      )

      .replace(
        /\n\s*\n+/g,
        '\n\n'
      )

      .trim();

  text =
    text.replace(
      /\n/g,
      '<br>'
    );


  return `<div>${text}</div>`;
}


/**
 * ================================================================
 * HELPERS
 * ================================================================
 */

function htmlToPlainText(
  html
) {

  let text =
    html;

  text =
    text

      .replace(
        /<script[\s\S]*?<\/script>/gi,
        ''
      )

      .replace(
        /<style[\s\S]*?<\/style>/gi,
        ''
      )

      .replace(
        /<br\s*\/?>/gi,
        '\n'
      )

      .replace(
        /<\/(p|div|li|tr|h[1-6])>/gi,
        '\n'
      )

      .replace(
        /<[^>]*>/g,
        ''
      );


  text =
    decodeHtmlEntities(
      text
    );


  return stripEmoji(
    text
  )

    .replace(
      /[ \t]+/g,
      ' '
    )

    .replace(
      /\n\s*\n+/g,
      '\n\n'
    )

    .trim();
}


function decodeHtmlEntities(
  text
) {

  return text

    .replace(
      /&nbsp;/gi,
      ' '
    )

    .replace(
      /&amp;/gi,
      '&'
    )

    .replace(
      /&lt;/gi,
      '<'
    )

    .replace(
      /&gt;/gi,
      '>'
    )

    .replace(
      /&quot;/gi,
      '"'
    )

    .replace(
      /&#39;/gi,
      "'"
    )

    .replace(
      /&rsquo;/gi,
      '’'
    )

    .replace(
      /&lsquo;/gi,
      '‘'
    )

    .replace(
      /&rdquo;/gi,
      '”'
    )

    .replace(
      /&ldquo;/gi,
      '“'
    )

    .replace(
      /&mdash;/gi,
      '—'
    )

    .replace(
      /&ndash;/gi,
      '–'
    )

    .replace(
      /&#x([0-9a-f]+);/gi,
      (match, hex) =>
        String.fromCodePoint(
          parseInt(hex, 16)
        )
    )

    .replace(
      /&#(\d+);/g,
      (match, code) =>
        String.fromCodePoint(
          Number(code)
        )
    );
}


function sanitizeEmailHtml(
  html
) {

  let cleaned =
    html;

  cleaned =
    cleaned

      .replace(
        /<script[\s\S]*?<\/script>/gi,
        ''
      )

      .replace(
        /<iframe[\s\S]*?<\/iframe>/gi,
        ''
      )

      .replace(
        /<object[\s\S]*?<\/object>/gi,
        ''
      )

      .replace(
        /<embed[\s\S]*?>/gi,
        ''
      )

      .replace(
        /<form[\s\S]*?<\/form>/gi,
        ''
      );

  cleaned =
    cleaned.replace(
      /\s+on[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi,
      ''
    );

  cleaned =
    cleaned.replace(
      /(href|src)\s*=\s*(['"]?)\s*javascript:[^'">\s]*\2/gi,
      ''
    );

  cleaned =
    cleaned.replace(
      /<img\b([^>]*)>/gi,
      '<img$1 style="max-width:100%;height:auto;">'
    );

  cleaned =
    cleaned.replace(
      /<table\b/gi,
      '<table style="max-width:100%;"'
    );


  return cleaned.trim();
}


function createArchiveFilename(
  msg
) {

  const date =
    Utilities.formatDate(
      msg.getDate(),
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );


  let subject =
    stripEmoji(
      msg.getSubject() ||
      'No subject'
    );

  subject =
    subject

      .replace(
        /[\\\/:*?"<>|#%{}[\]]/g,
        ''
      )

      .replace(
        /\s+/g,
        ' '
      )

      .trim();

  if (
    subject.length > 100
  ) {

    subject =
      subject
        .substring(0, 100)
        .trim();
  }


  return (
    `${date} - ${subject}.html`
  );
}

function formatDate(
  date
) {

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd MMM yyyy'
  );
}

function formatDateTime(
  date
) {

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd MMM yyyy, HH:mm:ss'
  );
}

function addDays(
  date,
  days
) {

  const d =
    new Date(date);


  d.setDate(
    d.getDate() + days
  );


  return d;
}

function escapeHtml(
  str
) {

  return String(
    str || ''
  )

    .replace(
      /&/g,
      '&amp;'
    )

    .replace(
      /</g,
      '&lt;'
    )

    .replace(
      />/g,
      '&gt;'
    );
}

function escapeAttribute(
  str
) {

  return String(
    str || ''
  )

    .replace(
      /&/g,
      '&amp;'
    )

    .replace(
      /"/g,
      '&quot;'
    )

    .replace(
      /</g,
      '&lt;'
    )

    .replace(
      />/g,
      '&gt;'
    );
}

function stripHtml(
  html
) {

  return String(
    html || ''
  )

    .replace(
      /<[^>]*>/g,
      ''
    )

    .replace(
      /\s+/g,
      ' '
    )

    .trim();
}

function stripEmoji(
  str
) {

  return String(
    str || ''
  )

    .replace(
      /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}\u{2049}\u{203C}]/gu,
      ''
    )

    .replace(
      /\s{2,}/g,
      ' '
    )

    .trim();
}


/**
 * ================================================================
 * WEEKLY TRIGGER
 * ================================================================
 *
 * Run this ONCE after you have tested sendWeeklyDigest().
 */
function createWeeklyTrigger() {

  ScriptApp
    .getProjectTriggers()
    .forEach(
      trigger => {

        if (
          trigger.getHandlerFunction() ===
          'sendWeeklyDigest'
        ) {

          ScriptApp.deleteTrigger(
            trigger
          );

        }

      }
    );

  ScriptApp
    .newTrigger(
      'sendWeeklyDigest'
    )

    .timeBased()

    .onWeekDay(
      CONFIG.triggerDay
    )

    .atHour(
      CONFIG.triggerHour
    )

    .create();


  Logger.log(
    'Weekly trigger created for Monday morning.'
  );
}