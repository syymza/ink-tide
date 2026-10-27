(() => {
  'use strict';
  const vertex=`#version 300 es
    in vec2 position;out vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  const header=`#version 300 es
    precision highp float;precision highp sampler2D;in vec2 uv;out vec4 result;
    const vec2 world=vec2(1500.,1100.);const vec3 ivory=vec3(238.,231.,215.)/255.;
    vec2 model(vec2 p){return vec2(p.x,1.-p.y)*world;}
    vec2 texturePoint(vec2 p){p/=world;return vec2(p.x,1.-p.y);}
    vec4 paint(sampler2D image,vec2 p){if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,vec2(1.))))return vec4(ivory,1.);return texture(image,p);}
  `;
  window.InkBath=class {
    constructor(canvas,grain,forcePacked=false){
      this.canvas=canvas;this.width=1020;this.height=748;this.passes=0;this.active=false;this.cache=null;
      const gl=this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true,depth:false,stencil:false});
      if(!gl)throw new Error('WebGL 2 is unavailable');
      this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      this.packed=forcePacked||!gl.getExtension('EXT_color_buffer_float');
      this.base=this.target(false);this.work=this.target(false);
      try{this.maps=[this.target(true),this.target(true)];}catch{this.packed=true;this.maps=[this.target(true),this.target(true)];}
      this.masks=[this.target(false),this.target(false)];
      this.grain=this.texture(1500,1100,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,grain,false);
      const codec=this.packed?`
        vec2 decode(vec4 c){return vec2(c.r*65280.+c.g*255.,c.b*65280.+c.a*255.)/65535.*1.5-.25;}
        vec4 encode(vec2 p){vec2 n=floor(clamp((p+.25)/1.5,0.,1.)*65535.+.5);return vec4(floor(n.x/256.),mod(n.x,256.),floor(n.y/256.),mod(n.y,256.))/255.;}
      `:`vec2 decode(vec4 c){return c.xy;}vec4 encode(vec2 p){return vec4(p,0.,1.);}`;
      const mapFunctions=codec+`
        uniform sampler2D coordinateMap;
        vec2 coordinates(vec2 p){if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,vec2(1.))))return p;
          vec2 size=vec2(textureSize(coordinateMap,0)),at=p*size-.5;ivec2 a=ivec2(floor(at)),last=ivec2(size)-1;vec2 f=fract(at);
          vec2 c00=decode(texelFetch(coordinateMap,clamp(a,ivec2(0),last),0));vec2 c10=decode(texelFetch(coordinateMap,clamp(a+ivec2(1,0),ivec2(0),last),0));
          vec2 c01=decode(texelFetch(coordinateMap,clamp(a+ivec2(0,1),ivec2(0),last),0));vec2 c11=decode(texelFetch(coordinateMap,clamp(a+ivec2(1),ivec2(0),last),0));
          return mix(mix(c00,c10,f.x),mix(c01,c11,f.x),f.y);}
      `;
      this.identity=this.program(header+codec+`void main(){result=encode(uv);}`);
      const motionField=`
        uniform vec4 endpoints[7];uniform vec3 vectors[7];uniform vec3 footprint;
        vec2 velocity(vec2 p){vec2 sum=vec2(0.);for(int i=0;i<7;i++){vec2 direction=vectors[i].xy;float weight=vectors[i].z;
          for(int end=0;end<2;end++){vec2 relative=p-(end==0?endpoints[i].xy:endpoints[i].zw);float x=dot(relative,direction)/footprint.z,y=dot(relative,vec2(-direction.y,direction.x)),r2=x*x+y*y+9.;if(r2>=footprint.y*footprint.y)continue;
            float r=sqrt(r2),taper=1.,derivative=0.;if(r>footprint.y*.76923077){float range=footprint.y*.23076923,q=(r-footprint.y*.76923077)/range;taper=1.-q*q*q*(10.-15.*q+6.*q*q);derivative=-30.*q*q*(q-1.)*(q-1.)/range;}
            float e=exp(-r/footprint.x),radial=taper/footprint.x-derivative;vec2 local=vec2(taper-y*y/r*radial,x*y/r*radial)*e;
            sum+=(direction*local.x*footprint.z+vec2(-direction.y,direction.x)*local.y)*weight;}}
          return sum;}
`;
      this.mapping=this.program(header+mapFunctions+motionField+`void main(){vec2 p=model(uv),first=velocity(p),back=p-velocity(p-first*.5);result=encode(coordinates(texturePoint(back)));}`);
      this.advectMask=this.program(header+motionField+`uniform sampler2D priorMask;void main(){vec2 p=model(uv),first=velocity(p),back=p-velocity(p-first*.5);vec2 q=texturePoint(back);float mask=any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.)))?0.:texture(priorMask,q).r;result=vec4(mask,0.,0.,1.);}`);
      this.resolve=this.program(header+mapFunctions+`uniform sampler2D source;void main(){result=paint(source,coordinates(uv));}`);
      this.dropping=this.program(header+`
        uniform sampler2D source;uniform vec2 centre;uniform float radius;uniform vec3 pigment;
        void main(){vec2 p=model(uv),d=p-centre;float lengthD=length(d);if(radius<.01){result=paint(source,uv);return;}
          vec2 previous=centre+d*sqrt(max(0.,1.-radius*radius/max(dot(d,d),.0001)));
          vec3 old=paint(source,texturePoint(previous)).rgb,edge=mix(pigment,vec3(40.,60.,50.)/255.,.035);
          vec3 ink=mix(pigment,edge,smoothstep(radius*.982,radius*.993,lengthD));float outside=smoothstep(radius-.8,radius+.8,lengthD);
          result=vec4(mix(ink,old,outside),1.);}
      `);
      const depositTrace=`uniform vec4 deposits[16];uniform int depositCount;uniform float depositAngle;
        vec3 traceDrop(vec2 at){for(int i=15;i>=0;i--){if(i>=depositCount)continue;vec2 d=at-deposits[i].xy;float r=deposits[i].z,aspect=max(1.,deposits[i].w),stretch=sqrt(aspect);vec2 direction=vec2(cos(depositAngle),sin(depositAngle)),normal=vec2(-direction.y,direction.x),local=vec2(dot(d,direction)*stretch,dot(d,normal)/stretch);float dist2=dot(local,local);if(dist2<r*r)return vec3(at,1.);float factor=sqrt(max(0.,1.-r*r/max(dist2,.0001)));at=deposits[i].xy+d*factor;}return vec3(at,0.);}`;
      this.microMap=this.program(header+mapFunctions+depositTrace+`void main(){vec3 trace=traceDrop(model(uv));result=encode(coordinates(texturePoint(trace.xy)));}`);
      this.microMask=this.program(header+depositTrace+`uniform sampler2D priorMask;void main(){vec3 trace=traceDrop(model(uv));float mask=trace.z>.5?1.:(any(lessThan(texturePoint(trace.xy),vec2(0.)))||any(greaterThan(texturePoint(trace.xy),vec2(1.)))?0.:texture(priorMask,texturePoint(trace.xy)).r);result=vec4(mask,0.,0.,1.);}`);
      this.resolvePigment=this.program(header+mapFunctions+`uniform sampler2D source;uniform sampler2D inkMask;uniform vec3 pigment;void main(){float mask=texture(inkMask,uv).r;result=vec4(mix(paint(source,coordinates(uv)).rgb,pigment,mask),1.);}`);
      this.show=this.program(header+`
        uniform sampler2D source;uniform sampler2D paperGrain;uniform bool portrait;uniform vec4 impacts[4];uniform vec4 wakes[12];uniform vec4 wakeInfo[12];
        // Bounded display-only refraction; cross-light strokes must remain visible too.
        vec3 wakeSurface(vec2 at){vec2 displacement=vec2(0.);float light=0.;for(int i=0;i<12;i++){vec4 info=wakeInfo[i];if(info.w==0.||info.x<0.||info.x>.55)continue;vec2 d=wakes[i].zw-wakes[i].xy;float lengthD=length(d);if(lengthD<.01)continue;vec2 direction=d/lengthD,normal=vec2(-direction.y,direction.x);vec2 relative=at-wakes[i].xy;float along=dot(relative,direction),crossing=dot(relative,normal),cap=max(0.,max(-along,along-lengthD));if(cap>35.)continue;
          float distanceToContact=crossing;if(info.z<.5){float tooth=clamp(floor(crossing/78.+.5),-3.,3.);distanceToContact-=tooth*78.;if(abs(crossing)>255.)continue;}
          if(abs(distanceToContact)>info.y*3.)continue;float envelope=exp(-distanceToContact*distanceToContact/(info.y*info.y)-cap*cap/250.)*exp(-info.x*3.5)*(1.-smoothstep(.28,.55,info.x));
          float height=sin(abs(distanceToContact)/info.y*2.8-info.x*11.)*envelope;
          displacement+=normal*sign(distanceToContact)*height*info.w*70.;
          light+=height*info.w*3.2*(.65+.35*abs(dot(normal,vec2(-.6,-.8))));}return vec3(clamp(displacement,vec2(-1.4),vec2(1.4)),clamp(light,-.055,.055));}
        vec3 surface(vec2 at){vec2 displacement=vec2(0.);float light=0.;
          for(int i=0;i<4;i++){float age=impacts[i].z,amplitude=impacts[i].w;if(age<0.||age>1.35||amplitude==0.)continue;
            vec2 delta=at-impacts[i].xy;float r=length(delta);vec2 normal=delta/max(r,.001);
            float q=(r-370.*age)/38.,phase=(r-370.*age)*.095;
            float envelope=exp(-.5*q*q)*smoothstep(0.,.055,age)*(1.-smoothstep(.65,1.35,age));
            float height=sin(phase)*envelope;
            displacement+=normal*height*amplitude;
            float slope=(.095*cos(phase)-q/38.*sin(phase))*envelope;
            light+=slope*dot(normal,vec2(-.6,-.8))*.42*amplitude/5.;
          }
          return vec3(displacement,clamp(light,-.055,.055));}

        void main(){ivec2 cell=ivec2(gl_FragCoord.xy);vec2 p=((portrait?vec2(1499-cell.y,cell.x):vec2(cell))+.5)/world;vec3 wave=surface(model(p)),wake=wakeSurface(model(p));vec4 fibre=texture(paperGrain,p);vec3 colour=paint(source,texturePoint(model(p)-wave.xy-wake.xy)).rgb;result=vec4(colour*mix(vec3(1.),fibre.rgb,fibre.a)+wave.z+wake.z,1.);}
      `);
      this.blank();
    }
    program(fragment){const gl=this.gl,program=gl.createProgram();for(const[type,source]of[[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader);gl.deleteShader(shader);}gl.bindAttribLocation(program,0,'position');gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);return{program,uniforms:{}};}
    uniform(p,name){return p.uniforms[name]??(p.uniforms[name]=this.gl.getUniformLocation(p.program,name));}
    use(p,target){const gl=this.gl;gl.useProgram(p.program);gl.bindVertexArray(this.vao);gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fbo||null);gl.viewport(0,0,target?this.width:this.canvas.width,target?this.height:this.canvas.height);}
    bind(p,name,texture,unit){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.uniform(p,name),unit);}
    texture(w,h,internal,format,type,data,linear){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,internal,w,h,0,format,type,data);return t;}
    target(map){const gl=this.gl,t=this.texture(this.width,this.height,map&&!this.packed?gl.RG32F:gl.RGBA8,map&&!this.packed?gl.RG:gl.RGBA,map&&!this.packed?gl.FLOAT:gl.UNSIGNED_BYTE,null,!map),fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteTexture(t);gl.deleteFramebuffer(fbo);throw new Error('Coordinate target unavailable');}return{texture:t,fbo};}
    draw(){this.gl.drawArrays(this.gl.TRIANGLE_STRIP,0,4);}
    blank(){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.base.fbo);gl.clearColor(238/255,231/255,215/255,1);gl.clear(gl.COLOR_BUFFER_BIT);this.active=false;this.cache=null;}
    read(){if(this.cache&&!this.active)return this.cache;const gl=this.gl,data=new Uint8Array(this.width*this.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,(this.active?this.work:this.base).fbo);gl.readPixels(0,0,this.width,this.height,gl.RGBA,gl.UNSIGNED_BYTE,data);if(!this.active)this.cache=data;return data;}
    upload(data){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.base.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,this.width,this.height,gl.RGBA,gl.UNSIGNED_BYTE,data);this.active=false;this.cache=data;}
    drop(x,y,r,colour){const gl=this.gl,p=this.dropping;this.use(p,this.work);this.bind(p,'source',this.base.texture,0);gl.uniform2f(this.uniform(p,'centre'),x,y);gl.uniform1f(this.uniform(p,'radius'),r);gl.uniform3fv(this.uniform(p,'pigment'),colour);this.draw();this.active=true;}
    beginPigmentStroke(colour){this.beginStroke();this.pigmentStroke=true;this.strokeColour=colour;const gl=this.gl;for(const mask of this.masks){gl.bindFramebuffer(gl.FRAMEBUFFER,mask.fbo);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}}
    deposit(drops,colour,angle=0){for(let offset=0;offset<drops.length;offset+=16){const chunk=drops.slice(offset,offset+16),gl=this.gl,field=new Float32Array(64),from=this.mapIndex,to=1-from;chunk.forEach((d,i)=>field.set([d[0],d[1],d[2],d[3]||1],i*4));
      const map=this.microMap;this.use(map,this.maps[to]);this.bind(map,'coordinateMap',this.maps[from].texture,0);gl.uniform4fv(this.uniform(map,'deposits[0]'),field);gl.uniform1i(this.uniform(map,'depositCount'),chunk.length);gl.uniform1f(this.uniform(map,'depositAngle'),angle);this.draw();
      const mask=this.microMask;this.use(mask,this.masks[to]);this.bind(mask,'priorMask',this.masks[from].texture,0);gl.uniform4fv(this.uniform(mask,'deposits[0]'),field);gl.uniform1i(this.uniform(mask,'depositCount'),chunk.length);gl.uniform1f(this.uniform(mask,'depositAngle'),angle);this.draw();this.mapIndex=to;this.passes++;}}
    beginStroke(){this.pigmentStroke=false;this.mapIndex=0;this.use(this.identity,this.maps[0]);this.draw();}
    step(teeth,footprint=[46,260,1]){
      footprint=[footprint[0],footprint[1],footprint[2]||1];
      const gl=this.gl,from=this.maps[this.mapIndex],to=this.maps[1-this.mapIndex];gl.bindFramebuffer(gl.READ_FRAMEBUFFER,from.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,to.fbo);gl.blitFramebuffer(0,0,this.width,this.height,0,0,this.width,this.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);
      const p=this.mapping;this.use(p,to);this.bind(p,'coordinateMap',from.texture,0);const ends=new Float32Array(28),vectors=new Float32Array(21);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(let i=0;i<teeth.length;i++){const t=teeth[i];ends.set(t.slice(0,4),i*4);vectors.set(t.slice(4,7),i*3);minX=Math.min(minX,t[0],t[2]);maxX=Math.max(maxX,t[0],t[2]);minY=Math.min(minY,t[1],t[3]);maxY=Math.max(maxY,t[1],t[3]);}
      gl.uniform4fv(this.uniform(p,'endpoints[0]'),ends);gl.uniform3fv(this.uniform(p,'vectors[0]'),vectors);gl.uniform3fv(this.uniform(p,'footprint'),footprint);
      const support=footprint[1]*Math.max(1,footprint[2])+2;const x=Math.max(0,Math.floor((minX-support)/1500*this.width)),y=Math.max(0,Math.floor((1100-maxY-support)/1100*this.height)),right=Math.min(this.width,Math.ceil((maxX+support)/1500*this.width)),top=Math.min(this.height,Math.ceil((1100-minY+support)/1100*this.height));
      gl.enable(gl.SCISSOR_TEST);gl.scissor(x,y,Math.max(0,right-x),Math.max(0,top-y));this.draw();gl.disable(gl.SCISSOR_TEST);
      if(this.pigmentStroke){const source=this.masks[this.mapIndex],dest=this.masks[1-this.mapIndex];gl.bindFramebuffer(gl.READ_FRAMEBUFFER,source.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,dest.fbo);gl.blitFramebuffer(0,0,this.width,this.height,0,0,this.width,this.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);const mask=this.advectMask;this.use(mask,dest);this.bind(mask,'priorMask',source.texture,0);gl.uniform4fv(this.uniform(mask,'endpoints[0]'),ends);gl.uniform3fv(this.uniform(mask,'vectors[0]'),vectors);gl.uniform3fv(this.uniform(mask,'footprint'),footprint);gl.enable(gl.SCISSOR_TEST);gl.scissor(x,y,Math.max(0,right-x),Math.max(0,top-y));this.draw();gl.disable(gl.SCISSOR_TEST);}
      this.mapIndex=1-this.mapIndex;this.passes++;
    }
    resolveStroke(){const p=this.pigmentStroke?this.resolvePigment:this.resolve;this.use(p,this.work);this.bind(p,'source',this.base.texture,0);this.bind(p,'coordinateMap',this.maps[this.mapIndex].texture,1);if(this.pigmentStroke){this.bind(p,'inkMask',this.masks[this.mapIndex].texture,2);this.gl.uniform3fv(this.uniform(p,'pigment'),this.strokeColour);}this.draw();this.active=true;}
    commit(){if(!this.active)return;[this.base,this.work]=[this.work,this.base];this.active=false;this.cache=null;}
    display(portrait,impacts=[],wakes=[]){const gl=this.gl,p=this.show;this.use(p,null);this.bind(p,'source',(this.active?this.work:this.base).texture,0);this.bind(p,'paperGrain',this.grain,1);gl.uniform1i(this.uniform(p,'portrait'),portrait?1:0);const field=new Float32Array(16);for(let i=0;i<Math.min(4,impacts.length);i++)field.set(impacts[i],i*4);gl.uniform4fv(this.uniform(p,'impacts[0]'),field);const lines=new Float32Array(48),info=new Float32Array(48);for(let i=0;i<Math.min(12,wakes.length);i++){lines.set(wakes[i].slice(0,4),i*4);info.set(wakes[i].slice(4,8),i*4);}gl.uniform4fv(this.uniform(p,'wakes[0]'),lines);gl.uniform4fv(this.uniform(p,'wakeInfo[0]'),info);this.draw();}
  };
})();
