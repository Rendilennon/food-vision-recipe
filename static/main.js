document.addEventListener("DOMContentLoaded", () => {
    const webcamElement = document.getElementById("webcam");
    const canvasElement = document.getElementById("overlay");
    const ctx = canvasElement.getContext("2d");
    const cameraSelect = document.getElementById("cameraSelect");
    
    const detectedSummaryEl = document.getElementById("detectedSummary"); 
    const detectionListEl = document.getElementById("detectionList");
    const recipeListEl = document.getElementById("recipeList");
    const statusBadge = document.getElementById("statusBadge");

    let isProcessing = false;

    // Database Statis Resep
    const recipeDatabase = {
        "bawang_putih": [
            { nama: "Roasted Garlic", desc: "Panggang bawang putih utuh dengan minyak zaitun hingga lembut." },
            { nama: "Garlic Oil", desc: "Panaskan cincangan bawang putih dengan minyak perlahan hingga keemasan." }
        ],
        "cabai": [
            { nama: "Cabai Bubuk (Chili Flakes)", desc: "Keringkan cabai lalu hancurkan kasar untuk taburan makanan." },
            { nama: "Chili Oil", desc: "Siram cabai cincang halus dengan minyak bersuhu tinggi." }
        ],
        "tomat": [
            { nama: "Pasta Tomat", desc: "Rebus tomat, kupas kulitnya, lalu blender dan masak hingga mengental." },
            { nama: "Jus Tomat Segar", desc: "Blender tomat segar dengan sedikit madu dan es batu." }
        ],
        "bawang_putih,tomat": [
            { nama: "Saus Marinara (Saus Pasta)", desc: "Tumis bawang putih cincang, masukkan pasta tomat, masak hingga harum." },
            { nama: "Sup Tomat Bawang Putih", desc: "Sup hangat dari tomat halus yang ditumis dengan bawang putih dan kaldu." }
        ],
        "bawang_putih,cabai": [
            { nama: "Sambal Bawang", desc: "Ulek kasar cabai dan bawang putih, lalu siram dengan minyak panas." },
            { nama: "Chili Garlic Sauce", desc: "Saus cocolan pedas gurih ala restoran dimsum." }
        ],
        "cabai,tomat": [
            { nama: "Sambal Tomat Segar", desc: "Ulek tomat, cabai, sedikit terasi dan garam. Cocok untuk lalapan." },
            { nama: "Salsa Meksiko Cepat", desc: "Cincang kasar tomat dan cabai, beri sedikit perasan jeruk nipis." }
        ],
        "bawang_putih,cabai,tomat": [
            { nama: "Sambal Korek Tomat", desc: "Ulek cabai, bawang putih, dan tomat segar, lalu siram minyak panas mendidih." },
            { nama: "Sambal Bajak Matang", desc: "Haluskan tomat, cabai, dan bawang putih, tumis dengan minyak hingga matang dan awet." }
        ]
    };

    async function getCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            cameraSelect.innerHTML = '';
            videoDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Kamera ${index + 1}`;
                cameraSelect.appendChild(option);
            });

            if (videoDevices.length > 0) {
                startWebcam(videoDevices[0].deviceId);
            }
        } catch (err) {
            console.error("Gagal mendapatkan perangkat kamera:", err);
            statusBadge.innerText = "Error: Kamera tidak ditemukan";
            statusBadge.style.backgroundColor = "#ef4444";
        }
    }

    async function startWebcam(deviceId) {
        if (window.stream) {
            window.stream.getTracks().forEach(track => track.stop());
        }

        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            window.stream = stream;
            webcamElement.srcObject = stream;

            webcamElement.onloadedmetadata = () => {
                canvasElement.width = webcamElement.videoWidth;
                canvasElement.height = webcamElement.videoHeight;
                statusBadge.innerText = "Status: Live";
                statusBadge.style.backgroundColor = "#10b981";
                
                processFrameLoop();
            };
        } catch (err) {
            console.error("Gagal mengakses webcam:", err);
            statusBadge.innerText = "Akses Kamera Ditolak";
            statusBadge.style.backgroundColor = "#ef4444";
        }
    }

    cameraSelect.addEventListener('change', () => {
        startWebcam(cameraSelect.value);
    });

    async function processFrameLoop() {
        if (!isProcessing && webcamElement.readyState === 4) {
            isProcessing = true;
            await sendFrameToBackend();
            isProcessing = false;
        }
        setTimeout(processFrameLoop, 200); 
    }

    async function sendFrameToBackend() {
        const captureCanvas = document.createElement("canvas");
        captureCanvas.width = canvasElement.width;
        captureCanvas.height = canvasElement.height;
        
        const captureCtx = captureCanvas.getContext("2d");
        captureCtx.drawImage(webcamElement, 0, 0, captureCanvas.width, captureCanvas.height);

        captureCanvas.toBlob(async (blob) => {
            if (!blob) return;

            const formData = new FormData();
            formData.append("file", blob, "frame.jpg");

            try {
                const response = await fetch("/detect", {
                    method: "POST",
                    body: formData
                });
                
                if (response.ok) {
                    const data = await response.json();
                    updateUI(data);
                }
            } catch (err) {
                console.error("Error mengirim frame:", err);
            }
        }, "image/jpeg", 0.6);
    }

    function updateUI(data) {
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        // Kita simpan RAW_CLASS untuk logika, bukan LABEL
        let bahanUnikTerdeteksi = new Set();
        
        detectionListEl.innerHTML = "";

        if (!data.detections || data.detections.length === 0) {
            detectedSummaryEl.innerText = "0 / 3 Bahan";
            detectionListEl.innerHTML = '<li class="empty-state">Kamera belum mendeteksi bahan.</li>';
            updateRecipeRecommendations(bahanUnikTerdeteksi);
            return;
        }

        data.detections.forEach(item => {
            // PENTING: Gunakan raw_class dari Python untuk logika unik dan resep
            // raw_class bentuknya bersih: "bawang_putih", "tomat", "cabai"
            if(item.raw_class) {
                 bahanUnikTerdeteksi.add(item.raw_class);
            }

            // --- Bagian Menggambar Kotak ---
            ctx.strokeStyle = "#ea580c";
            ctx.lineWidth = 3;
            ctx.strokeRect(item.box[0], item.box[1], item.box[2], item.box[3]);

            ctx.fillStyle = "#ea580c";
            ctx.font = "bold 14px sans-serif";
            // item.label digunakan HANYA untuk tampilan di kotak kamera
            const textWidth = ctx.measureText(item.label).width;
            ctx.fillRect(item.box[0], item.box[1] - 20, textWidth + 10, 20);

            ctx.fillStyle = "#ffffff";
            ctx.fillText(item.label, item.box[0] + 5, item.box[1] - 5);
        });

        // Tampilkan daftar bahan unik yang terdeteksi ke dalam list HTML
        bahanUnikTerdeteksi.forEach(bahan => {
            // Ubah "bawang_putih" jadi "Bawang Putih" untuk tampilan di list
            const labelTampil = bahan.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const li = document.createElement("li");
            li.className = "detection-item";
            li.innerHTML = `
                <div class="item-main"> 
                    <span class="label">🥘 ${labelTampil}</span> 
                    <span class="confidence">Terdeteksi ✓</span> 
                </div> 
            `;
            detectionListEl.appendChild(li);
        });

        // Panggil resep dengan Set yang berisi raw_class ("bawang_putih", "tomat", "cabai")
        updateRecipeRecommendations(bahanUnikTerdeteksi);
    }

    // Fungsi Logika Resep Baru dengan Static Database
    function updateRecipeRecommendations(bahanSet) {
        recipeListEl.innerHTML = '';
        
        let validIngredients = [];

        // 1. Filter nama bahan. 
        // Karena kita mengirim raw_class dari Python, kita cukup ngecek nilainya secara langsung:
        if (bahanSet.has('bawang_putih')) validIngredients.push('bawang_putih');
        if (bahanSet.has('cabai')) validIngredients.push('cabai');
        if (bahanSet.has('tomat')) validIngredients.push('tomat');

        // Update teks jumlah deteksi (misal: "2 / 3 Bahan")
        detectedSummaryEl.innerText = `${validIngredients.length} / 3 Bahan`;

        // Jika tidak ada bahan yang valid dikenali
        if (validIngredients.length === 0) {
            recipeListEl.innerHTML = '<li class="empty-state">Pindai bahan (Tomat/Bawang Putih/Cabai) di kamera untuk memunculkan ide masakan.</li>';
            return;
        }

        // 2. Buat "Key" kombinasi dengan mengurutkan secara alfabetis (A-Z)
        validIngredients.sort();
        const combinationKey = validIngredients.join(',');

        // 3. Ambil resep dari database statis berdasarkan key
        const recipes = recipeDatabase[combinationKey];

        // 4. Render ke HTML
        if (!recipes || recipes.length === 0) {
            recipeListEl.innerHTML = '<li class="empty-state">Kombinasi bahan ini belum memicu resep. Coba letakkan bahan lain.</li>';
        } else {
            recipes.forEach(resep => {
                recipeListEl.innerHTML += `
                    <li class="recipe-item">
                        <div class="recipe-title">🔥 ${resep.nama}</div>
                        <div class="recipe-desc">${resep.desc}</div>
                    </li>
                `;
            });
        }
    }

    getCameras();
});