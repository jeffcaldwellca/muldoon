jQuery(document).ready(function ($) {
  var o = localizedObj;

  /* ── Mapping accordion ──────────────────────────────────────── */
  $('.muldoon_mappings').accordion({
    header: '.muldoon_mapping_header',
    collapsible: true,
    active: false,
    animate: { duration: 200, easing: 'swing' },
    heightStyle: 'content'
  });

  // Prevent accordion toggle when clicking inside inputs
  $('.muldoon_input_wrap input').on('click', function (e) {
    e.stopPropagation();
  });

  /* ── Drag-to-reorder sort ───────────────────────────────────── */
  $('.muldoon_mappings').sortable({
    handle: '.muldoon_mapping_header',
    axis: 'y',
    cursor: 'grabbing',
    placeholder: 'muldoon_sort_placeholder',
    tolerance: 'pointer',
    start: function (e, ui) {
      // Collapse accordion item being dragged
      ui.item.find('.muldoon_mapping_body').hide();
    },
    update: function () {
      // Re-index sortorder hidden inputs to reflect new order
      $(this).find('.muldoon_sortorder').each(function (i) {
        $(this).val(i);
      });
      // Accordion needs to be refreshed after DOM reorder
      $(this).accordion('refresh');
      markDirty();
    }
  });

  /* ── Delete mapping ─────────────────────────────────────────── */
  $('.muldoon_delete_mapping a').on('click', function (e) {
    e.preventDefault();
    $(this).closest('.muldoon_mapping').remove();
    showNotice(buildNotice(o.removedMessage, o.undoMessage, o.dismissMessage));
    markDirty();
  });

  /* ── Unsaved-changes hint ───────────────────────────────────── */
  // Surface a persistent reminder the moment a mapping is edited, added,
  // toggled, reordered, or removed - mirrors the delete-undo affordance so
  // users know their changes only take effect on save. Cleared on reload (save).
  var dirtyShown = false;
  function markDirty() {
    if (dirtyShown) return;
    dirtyShown = true;
    var $status = $('.muldoon_save_status');
    if ($status.length) {
      // Surface unsaved state inside the action bar (status left of the Save button).
      $status.addClass('is-dirty').text(o.unsavedStatus).attr('title', o.unsavedMessage);
    } else {
      // Save bar absent (e.g. at the max_input_vars limit) - fall back to a notice under the heading.
      var $msg    = $('<p>').append($('<strong>').text(o.unsavedMessage));
      var $notice = $('<div>').addClass('notice notice-warning muldoon_notice muldoon_dirty_notice').append($msg);
      showNotice($notice);
    }
  }
  // Any keystroke or change in an existing row or the add-new row marks the form dirty.
  $('body').on('input change', '.muldoon_mappings :input, .muldoon_new_mapping :input', markDirty);

  /* ── Active toggle: reflect disabled state live ─────────────── */
  $('body').on('change', '.muldoon_toggle_label input[type=checkbox]', function () {
    $(this).closest('.muldoon_mapping').toggleClass('muldoon_mapping_disabled', !this.checked);
  });

  /* ── Health check ───────────────────────────────────────────── */
  $('body').on('click', '.muldoon_health_btn', function () {
    var $btn    = $(this);
    var $result = $btn.siblings('.muldoon_health_result');
    var domain  = $btn.data('domain');
    $result.attr('class', 'muldoon_health_result muldoon_health_loading').text('\u2026');
    $.post(o.ajaxUrl, {
      action: 'muldoon_health_check',
      nonce:  o.healthNonce,
      domain: domain
    }).done(function (res) {
      if (res.success) {
        var code   = res.data.code;
        var ok     = (code >= 200 && code < 400);
        var label  = (ok ? o.healthOk : o.healthFail) + ' (' + code + ')';
        $result.attr('class', 'muldoon_health_result ' + (ok ? 'muldoon_health_ok' : 'muldoon_health_fail')).text(label);
      } else {
        $result.attr('class', 'muldoon_health_result muldoon_health_fail').text(o.healthError + ': ' + (res.data ? res.data.message : ''));
      }
    }).fail(function () {
      $result.attr('class', 'muldoon_health_result muldoon_health_fail').text(o.healthError);
    });
  });

  /* ── Export mappings ────────────────────────────────────────── */
  $('#muldoon_export_btn').on('click', function () {
    $.post(o.ajaxUrl, { action: 'muldoon_export_mappings', nonce: o.exportNonce })
      .done(function (res) {
        if (!res.success) return;
        var blob = new Blob([JSON.stringify(res.data.mappings, null, 2)], { type: 'application/json' });
        var url  = URL.createObjectURL(blob);
        var $a   = $('<a>').attr({ href: url, download: 'muldoon-mappings.json' }).appendTo('body');
        $a[0].click();
        $a.remove();
        URL.revokeObjectURL(url);
      });
  });

  /* ── Import mappings ────────────────────────────────────────── */
  $('#muldoon_import_file').on('change', function () {
    var file = this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      $.post(o.ajaxUrl, {
        action: 'muldoon_import_mappings',
        nonce:  o.importNonce,
        data:   e.target.result
      }).done(function (res) {
        if (res.success) {
          showNotice(buildNotice(res.data.message, null, o.dismissMessage, 'success'));
          setTimeout(function () { location.reload(); }, 1500);
        } else {
          showNotice(buildNotice((res.data ? res.data.message : o.importError), null, o.dismissMessage, 'error'));
        }
      }).fail(function () {
        showNotice(buildNotice(o.importError, null, o.dismissMessage, 'error'));
      });
    };
    reader.readAsText(file);
    // Reset so the same file can be re-selected
    this.value = '';
  });

  /* ── Delegated: undo reload ─────────────────────────────────── */
  $('body').on('click', '.muldoon_reload', function (e) {
    e.preventDefault();
    location.reload();
  });

  /* ── Delegated: dismiss dynamically created notices ─────────── */
  $('body').on('click', '.muldoon_notice .notice-dismiss', function () {
    $(this).closest('.muldoon_notice').remove();
  });

  /* ── Helper: build a dismissible notice ─────────────────────── */
  // actionLabel is optional \u2014 when provided, an undo/reload link is appended.
  // noticeType picks the WP notice colour (info/success/error); defaults to info.
  function buildNotice(message, actionLabel, dismissLabel, noticeType) {
    var $msg = $('<p>').append($('<strong>').text(message));
    if (actionLabel) {
      var $undo = $('<a>').addClass('muldoon_reload').attr('href', '#').text(actionLabel);
      $msg.append(' \u2014 ').append($undo);
    }
    var $dismiss = $('<button>').attr('type', 'button').addClass('notice-dismiss')
                    .append($('<span>').addClass('screen-reader-text').text(dismissLabel));
    return $('<div>').addClass('notice notice-' + (noticeType || 'info') + ' is-dismissible muldoon_notice')
                     .append($msg).append($dismiss);
  }

  // Place a notice where it stays visible: above the sticky Save button when
  // present, else under the page heading (Save is hidden at the max_input_vars limit).
  function showNotice($notice) {
    var $bar = $('.muldoon_wrap .muldoon_actionbar');
    if ($bar.length) {
      $notice.insertBefore($bar);
    } else {
      $('.muldoon_wrap .muldoon_brandhead').first().after($notice);
    }
  }
});
