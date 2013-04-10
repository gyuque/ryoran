(function(aGlobal) {
	'use strict';
	var BALL_MAX = 300;
	var theApp = null;
	var simulator = null;
	var dboard = null;
	
	aGlobal.launch = function() {
		theApp = new App(document.getElementById('target-cv'), document.getElementById('preview-cv') );
	};
	
	function App(targetCanvas,  previewCanvas) {
		this.targetCanvas = targetCanvas;
		this.previewCanvas =  previewCanvas;
		this.undoBuffer = document.createElement("canvas");
		
		this.dboard = new DrawingBoard(targetCanvas, previewCanvas); 
		this.simulator = new Simulator(targetCanvas);

		this.containerElement = document.getElementById("app-container");
		this.jContainerElement = $(this.containerElement);
		this.loadedImage = new Image();
		this.loadedImage.onload = this.onImageLoad.bind(this);
		
		var w = $(window);
		this.fitWithWindow = this.fitSize.bind(this, w);
		w.resize(this.fitWithWindow);
		this.fitWithWindow();
		
		this.undoButton = document.getElementById("btn-undo");
		this.undoButton.disabled = "disabled";
		$(this.undoButton).click(this.undo.bind(this));
		
		$('#welcome').click( this.selectFile.bind(this) );
		$('#select-file').change( this.changeFile.bind(this) );
		$('#btn-genpng').click( this.generateDownloadLink.bind(this, false) );
		$('#btn-genjpg').click( this.generateDownloadLink.bind(this, true, 0.8) );
		$('#btn-genjpg-hq').click( this.generateDownloadLink.bind(this, true, 0.98) );
		
		this.observeDrop(document.body.parentNode);
		this.dboard.eventDispatcher().bind( DrawingBoard.TRIGGER_RELEASED, this.onTriggerRelease.bind(this) );
	}
	
	App.prototype = {
		fitSize: function(resizeParent) {
			var cw = resizeParent.width();
			var ch = resizeParent.height();
			var w  = this.jContainerElement.width();
			var h  = this.jContainerElement.height();
			
			var x = (cw - w) >> 1;
			var y = (ch - h) >> 1;
			if (x < 0) {x = 0;}
			if (y < 0) {y = 0;}
			
			this.containerElement.style.left = x + "px";
			this.containerElement.style.top  = y + "px";
		},
		
		setSize: function(w, h) {
			this.containerElement.style.width  = w + "px";
			this.containerElement.style.height = h + "px";

			this.targetCanvas.width  = w;
			this.targetCanvas.height = h;
			
			this.previewCanvas.width  = w;
			this.previewCanvas.height = h;
			
			this.undoBuffer.width = w;
			this.undoBuffer.height = h;
		},
		
		observeDrop: function(target) {
			var _this = this;
			$(target).
			 on('dragenter', function(e) {e.preventDefault(); }).
			 on('dragover' , function(e){ e.preventDefault(); }).
			 on('drop', function(e){
				e.preventDefault();
				var files = e.originalEvent.dataTransfer.files;
				_this.loadImageFile(files[0]);
			});
		},
		
		selectFile: function() {
			$('#select-file').click();
		},
		
		changeFile: function(e) {
			e.preventDefault();
			var files = e.target.files;
			this.loadImageFile(files[0]);
		},
		
		updateUndoImage: function() {
			this.undoButton.removeAttribute('disabled');
			this.undoBuffer.getContext("2d").drawImage(this.targetCanvas, 0, 0);
		},
		
		undo: function() {
			this.undoButton.disabled = "disabled";
			this.targetCanvas.getContext("2d").drawImage(this.undoBuffer, 0, 0);
		},
		
		generateDownloadLink: function(isJpeg, q) {
			var u;
			var a = document.getElementById("dl-link");
			if (!isJpeg) {
				a.download = "generated.png";
				u = this.targetCanvas.toDataURL("image/png");
			} else {
				a.download = "generated.jpg";
				u = this.targetCanvas.toDataURL("image/jpeg", q);
			}
			
			a.href = u;
			$(a).text("Download");
		},
		
		loadImageFile: function(file) {
			var reader = new FileReader();
			reader.onload = this.onFileRead.bind(this);
			reader.readAsDataURL(file);
		},
		
		onFileRead: function(e) {
			this.loadedImage.src = e.target.result;
		},
		
		onImageLoad: function() {
			$('#welcome').hide();
			$('#toolbar').show();
			
			var img = this.loadedImage;
			this.setSize(img.width, img.height);
			this.targetCanvas.getContext("2d").drawImage(img, 0, 0);
			
			this.targetCanvas.style.display = "inline";
			this.previewCanvas.style.display = "inline";
			this.fitWithWindow();
		},
		
		onTriggerRelease: function() {
			var pos = this.dboard.dragCenter;
			var len = this.dboard.dragVec.norm();
			if (len > 2) {
				this.updateUndoImage();
				
				this.simulator.scale = len / 20.0;
				this.simulator.setRenderPosition(pos.x, pos.y);
				this.runSimulator();
			}
		},
		
		runSimulator: function() {
			this.simulator.resetBalls();
			
			var i, j;
			var divs = BALL_MAX / 10;
			for (i = 0;i < divs;++i) {

				var angle = Math.PI * 2 * (i / divs);
				angle += (Math.random() * 0.04) - 0.02;

				var v0 = Math.random();
				var rr = Math.random()*0.3 + 0.7;
				for (j = 0;j < 10;++j) {
					var ball = this.simulator.requestBall();
					var v = Math.random() * 0.6 + 0.1;
					ball.R *= rr;
					if (v0 > 0.93) {
						v *= 1.3;
						ball.R *= 0.3;
					}

					ball.v.x =  Math.sin(angle) * v;
					ball.v.y = -Math.cos(angle) * v;
				}
			}

			for (i = 0;i < 65;++i) {
				this.simulator.tick();
			}	
		}
	};
	
	
	function DrawingBoard(renderCanvas, previewCanvas) {
		this.dragging = false;
		this.dragCenter = new Vec2();
		this.dragPt  = new Vec2();
		this.dragVec = new Vec2();
		
		this.previewCanvas = previewCanvas;
		this.jPreviewCanvas = $(previewCanvas); 
		this.previewContext = previewCanvas.getContext("2d");
		
		$(document.body).mouseout(this.onGlobalMouseOut.bind(this));
		
		this.jPreviewCanvas.
			mousedown( this.onMouseDown.bind(this) ).
			mousemove( this.onMouseMove.bind(this) ).
			mouseup( this.onMouseUp.bind(this) );
	}
	
	DrawingBoard.TRIGGER_RELEASED = "d-trigger-released";
	
	DrawingBoard.prototype = {
		eventDispatcher: function() {
			return this.jPreviewCanvas;
		},
		
		onMouseDown: function(e) {
			this.dragVec.zero();
			this.dragging = true;
			var o = this.jPreviewCanvas.offset();
			this.dragCenter.x = e.pageX - o.left;
			this.dragCenter.y = e.pageY - o.top;
		},

		onMouseMove: function(e) {
			if (this.dragging) {
				var o = this.jPreviewCanvas.offset();
				this.dragPt.x = e.pageX - o.left;
				this.dragPt.y = e.pageY - o.top;
				this.dragVec.copyFrom(this.dragPt).sub(this.dragCenter);
				var r = this.dragVec.norm();

				this.clearCanvas();
				this.drawPreview(this.dragCenter.x, this.dragCenter.y, r);
			}
		},

		onMouseUp: function(e) {
			if (this.dragging) {
				this.endDrag();
				this.eventDispatcher().trigger(DrawingBoard.TRIGGER_RELEASED);
			}
		},
		
		clearCanvas: function() {
			var g = this.previewContext;
			var cv = this.previewCanvas;
			g.clearRect(0, 0, cv.width, cv.height);
		},
		
		drawPreview: function(x, y, r) {
			var g = this.previewContext;
			g.fillStyle = "rgba(255, 0, 0, 0.5)";
			g.beginPath();
			g.arc(x, y, r, 0, Math.PI*2);
			g.fill();
		},
		
		onGlobalMouseOut: function(e) {
			this.endDrag();
		},
		
		endDrag: function() {
			this.dragging = false;	
			this.clearCanvas();
		}
	};
	
	function Simulator(targetCanvas) {
		this.drawPosition = new Vec2(200, 200);
		this.tickCount = 0;
		this.targetCanvas  = targetCanvas;
		this.targetContext = targetCanvas.getContext("2d");
		this.ballPool = this.createPool(BALL_MAX);
		this.scale = 1;
		
		this.tickClosure = this.tick.bind(this);
	}
	
	Simulator.prototype = {
		setRenderPosition: function(x, y) {
			this.drawPosition.x = x;
			this.drawPosition.y = y;
		},
		
		clearCanvas: function() {
			var g = this.targetContext;
			g.clearRect(0, 0, this.targetCanvas.width, this.targetCanvas.height);
		},
		
		resetBalls: function() {
			var len = this.ballPool.length;
			for (var i = 0;i < len;++i) {
				var ball = this.ballPool[i];
				ball.active = false;
			}
		},
		
		requestBall: function() {
			var len = this.ballPool.length;
			for (var i = 0;i < len;++i) {
				var ball = this.ballPool[i];
				if (!ball.active) {
					ball.active = true;
					ball.init();
					return ball;
				}
			}
			
			return null;
		},
		
		createPool: function(len) {
			var pool = new Array(len);
			for (var i = 0;i < len;++i) {
				pool[i] = new Simulator.Ball();
			}
			
			return pool;
		},
		
		tick: function() {
			//this.clearCanvas();
			
			++this.tickCount;
			var shouldContinue = false;
			var g = this.targetContext;
			g.strokeStyle = "#000";
			g.fillStyle = "#000";
			g.lineCap = "round";

			g.save();
			g.translate(this.drawPosition.x, this.drawPosition.y);
			g.scale(this.scale, this.scale);
			
			var len = this.ballPool.length;
			for (var i = 0;i < len;++i) {
				var ball = this.ballPool[i];
				if (ball.active) {
					ball.tick();
					//ball.drawDebug(this.targetContext);
					ball.draw(g);
					shouldContinue = true;
				}
			}
			
			//console.log("tick");
			g.restore();
		}
	};
	
	Simulator.Ball = function() {
		this.active = false;
		this.position = new Vec2();
		this.v = new Vec2();
	};
	
	Simulator.Ball.prototype = {
		init: function() {
			var R = 7;
			
			this.R = R;
			this.position.x = (normal_rand() - 0.5) * R*2;
			this.position.y = (normal_rand() - 0.5) * R*2;
			this.zv = 0;
			this.z = this.R*2 + Math.random();
			this.vfact = (Math.random() * Math.random()) * 0.07 + 0.95;
			this.bend = 0;
			this.prevLineWidth = 0;
			this.prevPos2 = new Vec2();
			this.prevPos = new Vec2();
		},
		
		tick: function() {
			this.prevPos2.copyFrom(this.prevPos);
			this.prevPos.copyFrom(this.position);
			this.position.add(this.v);
			this.zv -= 0.15;
			if (this.z < (this.R*0.9) && this.zv < 0.01) {
		//		this.zv *= -0.6;
				if (this.zv < 1) {
					this.zv += 0.1 + Math.random();
				}
			}
			
			this.R *= 0.92;
			this.R += Math.random() * 0.02;
			this.v.mul(this.vfact);
			this.z += this.zv;

			this.bend = (Math.random() * 0.02) - 0.01;
			rotateVector(this.v, this.bend); 
		},
		
		drawDebug: function(g) {
			g.fillStyle = "#13d";
			g.beginPath();
			g.arc(this.position.x, 50 - this.z*5, this.R, 0, Math.PI*2, false);
			g.fill();
		},
		
		draw: function(g) {
			var h = this.R * 1.13 - this.z;
			if (h > 0) {
				var dr = Math.sqrt(Math.sqrt(h)) * 3.0;
				dr *= dr * this.R;
				var limit = this.R * 4.0;
				if (dr > limit) {
					dr = limit;
				}
				
				g.beginPath();
				g.arc(this.position.x, this.position.y, dr, 0, Math.PI*2, false);
				g.fill();

				
				g.lineWidth = dr;
				g.beginPath();
				g.moveTo(this.prevPos2.x, this.prevPos2.y);
				g.lineTo(this.position.x, this.position.y);
				g.stroke();

				this.prevLineWidth = dr;
			}
		}
	};

	function normal_rand() {
		var s = 0;
		for (var i = 0;i < 5;++i) {
			s += Math.random();
		}
		
		return s / 5.0;
	}

	function rotateVector(v, a) {
		var C = Math.cos(a);
		var S = Math.sin(a);
		var x = v.x;
		var y = v.y;
		
		v.x = C*x - S*y;
		v.y = S*x + C*y;
	}
	
	function Vec2(x, y) {
		this.x = x || 0;
		this.y = y || 0;
	}
	
	Vec2.prototype = {
		zero: function() {
			this.x = 0;
			this.y = 0;
			return this;
		},

		add: function(v) {
			this.x += v.x;
			this.y += v.y;
			return this;
		},

		sub: function(v) {
			this.x -= v.x;
			this.y -= v.y;
			return this;
		},
		
		mul: function(k) {
			this.x *= k;
			this.y *= k;
			return this;
		},
		
		copyFrom: function(v) {
			this.x = v.x;
			this.y = v.y;
			return this;
		},
		
		norm: function() {
			return Math.sqrt(this.x*this.x + this.y*this.y);
		},
		
		dpWith: function(v) {
			return this.x * v.x + this.y * v.y;
		}
	};	
})(window);
