attribute vec4 aPosition;
attribute vec2 aTexCoord;

varying vec2 vTexCoord;

void main(){
    vTexCoord = aTexCoord;
    vTexCoord.y = vTexCoord.y * -1. + 1.;    // p5 のテクスチャは上下が反転しているので戻す

    vec4 position = aPosition * 2. - 1.;

    gl_Position = position;
}
