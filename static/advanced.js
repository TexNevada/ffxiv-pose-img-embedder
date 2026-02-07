// advanced.js - client behavior for the advanced editor
(function(){
    const advPoseFile = document.getElementById('advPoseFile');
    const clearAdvPose = document.getElementById('clearAdvPose');
    const advancedControls = document.getElementById('advancedControls');
    const resizeRow = document.getElementById('resizeRow');
    const authorInput = document.getElementById('authorInput');
    const descInput = document.getElementById('descInput');
    const versionInput = document.getElementById('versionInput');
    const tagInput = document.getElementById('tagInput');
    const tagList = document.getElementById('tagList');
    const tagCounter = document.getElementById('tagCounter');
    const authorCounter = document.getElementById('authorCounter');
    const descCounter = document.getElementById('descCounter');
    const verCounter = document.getElementById('verCounter');
    const imagePreview = document.getElementById('imagePreview');
    const noImagePlaceholder = document.getElementById('noImagePlaceholder');
    const replaceImageInput = document.getElementById('replaceImageInput');
    const clearReplaceImage = document.getElementById('clearReplaceImage');
    const advResize = document.getElementById('advResize');
    const createBtn = document.getElementById('createBtn');
    const startOverBtn = document.getElementById('startOverBtn');
    const errorBanner = document.getElementById('errorBanner');
    const changesField = document.getElementById('changesField');

    let originalJson = null;
    let currentTags = [];
    let changedFields = new Set();
    let replaceImageFile = null; // a File if user selected new image
    let currentObjectUrl = null; // track created object URLs so we can revoke them

    const MAX_POSE_BYTES = 10 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
    const MAX_TAGS = 50;

    function showError(msg){
        errorBanner.innerText = msg;
        errorBanner.style.display = 'block';
    }
    function clearError(){
        errorBanner.innerText = '';
        errorBanner.style.display = 'none';
    }

    function updateCounter(el, current, max){
        el.innerText = `${current}/${max}`;
        if(current > max){
            el.classList.add('over-limit');
        } else {
            el.classList.remove('over-limit');
        }
    }

    function renderTags(){
        tagList.innerHTML = '';
        currentTags.forEach((t, idx)=>{
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.innerText = t;
            chip.addEventListener('click', ()=>{
                // remove tag on click
                currentTags.splice(idx,1);
                changedFields.add('Tags');
                renderTags();
                updateCounter(tagCounter, currentTags.length, MAX_TAGS);
            });
            tagList.appendChild(chip);
        });
    }

    // Fit preview width to input width (approx)
    function adjustPreviewWidth(){
        const container = document.querySelector('.card');
        if(!container || !imagePreview) return;
        const inputWidth = container.clientWidth - 60; // small padding
        imagePreview.style.maxWidth = inputWidth + 'px';
        noImagePlaceholder.style.maxWidth = inputWidth + 'px';
    }

    window.addEventListener('resize', adjustPreviewWidth);

    // Helper to set preview image src and choose object-fit based on aspect ratio
    async function applyPreviewSrc(src, isObjectUrl = false){
        // revoke previous object URL if different
        if(currentObjectUrl && currentObjectUrl !== src){
            try{ URL.revokeObjectURL(currentObjectUrl); }catch(e){}
            currentObjectUrl = null;
        }
        if(isObjectUrl) currentObjectUrl = src;

        imagePreview.style.display = '';
        noImagePlaceholder.style.display = 'none';
        imagePreview.style.objectFit = 'contain'; // default
        imagePreview.src = src;

        // Wait for image to load so we can inspect dimensions
        await new Promise((resolve)=>{
            if(imagePreview.complete && imagePreview.naturalWidth){
                resolve();
            } else {
                const onLoad = ()=>{ imagePreview.removeEventListener('load', onLoad); resolve(); };
                imagePreview.addEventListener('load', onLoad);
                // also guard against error
                const onErr = ()=>{ imagePreview.removeEventListener('error', onErr); resolve(); };
                imagePreview.addEventListener('error', onErr);
            }
        });

        const w = imagePreview.naturalWidth || 0;
        const h = imagePreview.naturalHeight || 0;
        if(w && h){
            const ratio = w / h;
            // consider near-square -> fill the square (cover). tolerance 5%
            if(ratio >= 0.95 && ratio <= 1.05){
                imagePreview.style.objectFit = 'cover';
            } else {
                imagePreview.style.objectFit = 'contain';
            }
        } else {
            imagePreview.style.objectFit = 'contain';
        }
        adjustPreviewWidth();
    }

    // load pose file and parse json
    advPoseFile.addEventListener('change', async ()=>{
        clearError();
        changedFields.clear();
        replaceImageFile = null;
        // revoke previous object URL
        if(currentObjectUrl){ try{ URL.revokeObjectURL(currentObjectUrl); }catch(e){} currentObjectUrl = null; }

        if(!advPoseFile.files || !advPoseFile.files.length) return;
        const f = advPoseFile.files[0];
        if(f.size > MAX_POSE_BYTES){
            showError('Error: Pose file exceeds 10 MB');
            advPoseFile.value = '';
            return;
        }
        try{
            const txt = await f.text();
            const parsed = JSON.parse(txt);
            originalJson = parsed;
            // populate fields (treat null or missing as blank)
            authorInput.value = parsed.Author || '';
            descInput.value = parsed.Description || '';
            versionInput.value = parsed.Version || '';
            currentTags = Array.isArray(parsed.Tags) ? parsed.Tags.slice() : [];
            // image preview from Base64 if present
            if(parsed.Base64Image){
                const dataUrl = 'data:image/*;base64,' + parsed.Base64Image;
                await applyPreviewSrc(dataUrl, false);
            } else {
                imagePreview.style.display = 'none';
                noImagePlaceholder.style.display = '';
            }

            updateCounter(authorCounter, (authorInput.value||'').length, 50);
            updateCounter(descCounter, (descInput.value||'').length, 160);
            updateCounter(verCounter, (versionInput.value||'').length, 10);
            updateCounter(tagCounter, currentTags.length, MAX_TAGS);
            renderTags();

            // show resize controls and advanced controls now that JSON is loaded
            resizeRow.style.display = '';
            advancedControls.style.display = '';
            adjustPreviewWidth();
        }catch(err){
            showError('Error: Pose file is not valid JSON');
        }
    });

    clearAdvPose.addEventListener('click', ()=>{
        advPoseFile.value = '';
        originalJson = null;
        advancedControls.style.display = 'none';
        resizeRow.style.display = 'none';
        clearError();
        // revoke any object URL and clear preview
        if(currentObjectUrl){ try{ URL.revokeObjectURL(currentObjectUrl); }catch(e){} currentObjectUrl = null; }
        imagePreview.src = '';
        imagePreview.style.display = 'none';
        noImagePlaceholder.style.display = '';
    });

    // live counters
    authorInput.addEventListener('input', ()=>{
        updateCounter(authorCounter, authorInput.value.length, 50);
        changedFields.add('Author');
    });
    descInput.addEventListener('input', ()=>{
        updateCounter(descCounter, descInput.value.length, 160);
        changedFields.add('Description');
    });
    versionInput.addEventListener('input', ()=>{
        updateCounter(verCounter, versionInput.value.length, 10);
        changedFields.add('Version');
    });

    // tag input: Space or Enter commits tag; no spaces inside tag
    tagInput.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){
            e.preventDefault();
            const val = tagInput.value.trim();
            if(val.length && currentTags.length < MAX_TAGS){
                // tags cannot contain spaces; split on spaces as extra measure
                const token = val.split(/\s+/)[0];
                currentTags.push(token);
                changedFields.add('Tags');
                renderTags();
                updateCounter(tagCounter, currentTags.length, MAX_TAGS);
            }
            tagInput.value = '';
        } else if(e.key === 'Backspace' && tagInput.value === ''){
            // remove last tag
            if(currentTags.length){
                currentTags.pop();
                changedFields.add('Tags');
                renderTags();
                updateCounter(tagCounter, currentTags.length, MAX_TAGS);
            }
        }
    });

    // replace image preview immediately (scaled for preview only)
    replaceImageInput.addEventListener('change', async ()=>{
        clearError();
        if(!replaceImageInput.files || !replaceImageInput.files.length){
            replaceImageFile = null;
            return;
        }
        const f = replaceImageInput.files[0];
        replaceImageFile = f;
        changedFields.add('Base64Image');
        // create object URL and set preview, manage revocation
        const url = URL.createObjectURL(f);
        await applyPreviewSrc(url, true);
    });
    clearReplaceImage.addEventListener('click', ()=>{
        // revoke object url if any
        if(currentObjectUrl){ try{ URL.revokeObjectURL(currentObjectUrl); }catch(e){} currentObjectUrl = null; }
        replaceImageInput.value = '';
        replaceImageFile = null;
        changedFields.add('Base64Image');
        // if original JSON had a base64 image, restore it
        if(originalJson && originalJson.Base64Image){
            const dataUrl = 'data:image/*;base64,' + originalJson.Base64Image;
            applyPreviewSrc(dataUrl, false);
        } else {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
            noImagePlaceholder.style.display = '';
        }
    });

    async function buildChangesPayload(){
        const payload = {};
        // For each tracked field, if changedFields includes it, include either string or null if empty
        if(changedFields.has('Author')){
            payload.Author = authorInput.value.trim() === '' ? null : authorInput.value;
        }
        if(changedFields.has('Description')){
            payload.Description = descInput.value.trim() === '' ? null : descInput.value;
        }
        if(changedFields.has('Version')){
            payload.Version = versionInput.value.trim() === '' ? null : versionInput.value;
        }
        if(changedFields.has('Tags')){
            if(currentTags.length === 0) payload.Tags = null;
            else payload.Tags = currentTags.slice();
        }
        // If the user cleared the image (removed existing image) indicate null. Otherwise we do not inline Base64 here.
        if(changedFields.has('Base64Image') && !replaceImageFile){
            // User cleared image -> set to null (if it existed before or simply set to null)
            payload.Base64Image = null;
        }
        return payload;
    }

    createBtn.addEventListener('click', async ()=>{
        clearError();
        if(!advPoseFile.files || !advPoseFile.files.length){
            showError('Please upload a .pose file first');
            return;
        }
        const poseF = advPoseFile.files[0];
        if(poseF.size > MAX_POSE_BYTES){
            showError('Error: Pose file exceeds 10 MB');
            return;
        }
        // Enforce combined upload size (pose + attached image file if present) <= 10 MB client-side
        let combined = poseF.size + (replaceImageFile ? replaceImageFile.size : 0);
        if(combined > MAX_TOTAL_BYTES){
            showError('Error: Combined upload (pose + image) exceeds 10 MB');
            return;
        }

        // advisory client-side checks: mark counters red if over limit
        if(authorInput.value.length > 50 || descInput.value.length > 160 || versionInput.value.length > 10 || currentTags.length > MAX_TAGS){
            showError('One or more fields exceed maximum lengths (see counters)');
            // continue to allow submission; server will enforce
        }

        // Build minimal changes payload
        let changes = {};
        try{
            changes = await buildChangesPayload();
        }catch(err){
            showError('Failed to process image for embedding');
            return;
        }

        // If no changes, still submit to ensure missing keys are added? We'll allow empty changes -> server will return original
        const fd = new FormData();
        fd.append('pose_file', poseF, poseF.name);
        fd.append('changes', JSON.stringify(changes));
        fd.append('resize', advResize.value);
        // If the user selected or replaced an image, append the original file as image_file for server-side processing.
        if(replaceImageFile){
            fd.append('image_file', replaceImageFile, replaceImageFile.name);
        }

        createBtn.disabled = true;
        try{
            const resp = await fetch('/process_advanced', { method: 'POST', body: fd });
            if(!resp.ok){
                const txt = await resp.text();
                showError(txt || 'Server error');
                return;
            }
            const blob = await resp.blob();
            let filename = 'updated.pose';
            const cd = resp.headers.get('Content-Disposition') || '';
            const m = cd.match(/filename\*=UTF-8''([^;\n\r]+)|filename="?([^";]+)"?/);
            if(m){ filename = decodeURIComponent(m[1] || m[2]); }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            // keep form state; user can click Start over to reload
        }catch(err){
            showError('Upload failed: ' + err);
        }finally{
            createBtn.disabled = false;
        }
    });

    startOverBtn.addEventListener('click', ()=>{
        window.location.href = '/advanced';
    });

    // adjust preview width on load
    adjustPreviewWidth();
})();
