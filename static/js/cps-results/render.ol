
(disable-breakpoints)

(define width 400)
(define height 300)

(define ctx #f)
(define looped #f)

(define (render-clear)
  (set! ctx.fillStyle "black")
  (ctx.fillRect 0 0 width height))

(define (render-box color x y width height)
  (set! ctx.fillStyle color)
  (debug
   (ctx.fillRect x y width height)))

(define (start-box-render)
  (define i 0)
  
  (define (rand-int)
    (* (Math.random) 150))

  (define (rand-color)
    (str "rgb("
         (Math.floor (rand-int)) ","
         (Math.floor (rand-int)) ","
         (Math.floor (rand-int)) ")"))
  
  (define (render-rand x y width height)
    (render-box (rand-color) x y width height))

  (define (render)
    (if (< i 200)
        (begin
         (render-rand (rand-int)
                      (rand-int)
                      (rand-int)
                      (rand-int))
         (set! i (+ i 1)))
        (begin
          (render-clear)
          (set! i 0)))

    (if looped
        (begin
          (set! timer (setTimeout (callback () (render)) 0)))
        (render-clear)))

  (set! looped #t)
  (render))

(define (stop-box-render)
  (set! looped #f))

(document.addEventListener
 "DOMContentLoaded"
 (callback ()
   (let ((canvas (document.getElementById "canvas")))
    (set! canvas.width width)
    (set! canvas.height height)
    (set! ctx (canvas.getContext "2d"))
    (set! ctx.fillStyle "black")
    (ctx.fillRect 0 0 width height))))

(set! window.start_box_render (callback () (start-box-render)))
(set! window.stop_box_render (callback () (stop-box-render)))
